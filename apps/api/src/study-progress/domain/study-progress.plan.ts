import { UnprocessableEntityException } from '@nestjs/common';

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

export type StudyProgressTask = {
  kind: 'question' | 'resource';
  id: string;
  minutes: number;
  done: boolean;
};
export type StudyProgressPlan = {
  format: 'losapuntes.study-session';
  version: 1;
  subjectId: string;
  title: string;
  notes: string;
  startsAt: string | null;
  tasks: StudyProgressTask[];
};

function invalid(): never {
  throw new UnprocessableEntityException({
    code: 'STUDY_PROGRESS_PLAN_INVALID',
    message: 'Study Session v1 payload is invalid or exceeds limits',
  });
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return (
    Object.keys(value).sort().join(',') === expected.slice().sort().join(',')
  );
}
function clean(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max * 4) return invalid();
  const result = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (
    result.length > max ||
    [...result].some((char) => {
      const point = char.charCodeAt(0);
      return point <= 31 || point === 127;
    })
  )
    return invalid();
  return result;
}
function validTime(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || !TIME.test(value)) return false;
  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8, 10)) &&
    date.getHours() === Number(value.slice(11, 13)) &&
    date.getMinutes() === Number(value.slice(14, 16))
  );
}

/** Fail closed: never accept cached titles, tokens, signed URLs or grants. */
export function parseStudyProgressPlan(
  value: unknown,
  subjectId: string,
): StudyProgressPlan {
  if (
    !record(value) ||
    !keys(value, [
      'format',
      'version',
      'subjectId',
      'title',
      'notes',
      'startsAt',
      'tasks',
    ]) ||
    value.format !== 'losapuntes.study-session' ||
    value.version !== 1 ||
    typeof value.subjectId !== 'string' ||
    !UUID.test(value.subjectId) ||
    value.subjectId.toLowerCase() !== subjectId.toLowerCase() ||
    !Array.isArray(value.tasks) ||
    value.tasks.length > 24 ||
    !validTime(value.startsAt)
  )
    return invalid();

  const title = clean(value.title, 100);
  const notes = clean(value.notes, 500);
  if (!title) return invalid();
  const seen = new Set<string>();
  let total = 0;
  const tasks: StudyProgressTask[] = value.tasks.map((task: unknown) => {
    if (
      !record(task) ||
      !keys(task, ['kind', 'id', 'minutes', 'done']) ||
      (task.kind !== 'resource' && task.kind !== 'question') ||
      typeof task.id !== 'string' ||
      !UUID.test(task.id) ||
      !Number.isSafeInteger(task.minutes) ||
      (task.minutes as number) < 5 ||
      (task.minutes as number) > 120 ||
      (task.minutes as number) % 5 !== 0 ||
      typeof task.done !== 'boolean'
    )
      return invalid();
    const id = task.id.toLowerCase();
    const key = task.kind + ':' + id;
    if (seen.has(key)) return invalid();
    seen.add(key);
    total += task.minutes as number;
    return {
      kind: task.kind,
      id,
      minutes: task.minutes as number,
      done: task.done,
    };
  });
  if (total > 1200) return invalid();
  const parsed: StudyProgressPlan = {
    format: 'losapuntes.study-session',
    version: 1,
    subjectId: subjectId.toLowerCase(),
    title,
    notes,
    startsAt: value.startsAt,
    tasks,
  };
  if (Buffer.byteLength(JSON.stringify(parsed), 'utf8') > 64_000)
    return invalid();
  return parsed;
}
