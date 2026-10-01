import { PILOT_SUBJECT_METRICS_LIMIT } from '../domain/pilot.store';
import { MongoPilotStore } from './mongo-pilot.store';

const FROM = new Date('2026-09-16T12:00:00.000Z');
const TO = new Date('2026-09-30T12:00:00.000Z');
const PREVIOUS_FROM = new Date('2026-09-02T12:00:00.000Z');
const PREVIOUS_TO = FROM;

function aggregation<T>(rows: T[]) {
  return {
    toArray: jest.fn().mockResolvedValue(rows),
  };
}

describe('MongoPilotStore metrics aggregation bounds', () => {
  it('keeps audience/contributors server-side and limits subject density to one sentinel row', async () => {
    const usersAggregate = jest
      .fn()
      .mockReturnValue(
        aggregation([{ accountsCreated: 8, profilesCompleted: 6 }]),
      );

    const pilotEventAggregate = jest
      .fn()
      .mockReturnValueOnce(
        aggregation([
          { _id: 'activeStudent', activeUsers: 5, returningUsers: 3 },
          { _id: 'alumni', activeUsers: 2, returningUsers: 1 },
          { _id: 'community', activeUsers: 1, returningUsers: 0 },
        ]),
      )
      .mockReturnValueOnce(aggregation([{ count: 6 }]));
    const pilotEventCounts = jest
      .fn()
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(12);

    const subjectRows = Array.from(
      { length: PILOT_SUBJECT_METRICS_LIMIT + 1 },
      (_, index) => ({
        _id: `subject-${String(index).padStart(3, '0')}`,
        currentParticipants: 10 - (index % 3),
        resources: 4,
        openQuestions: 2,
        contributionEvents: 7 - (index % 2),
      }),
    );
    const subjectAggregate = jest
      .fn()
      .mockReturnValue(aggregation(subjectRows));

    function reportCollection(
      pending: number,
      reviewed: number,
      oldestAt: Date,
    ) {
      return {
        countDocuments: jest
          .fn()
          .mockResolvedValueOnce(pending)
          .mockResolvedValueOnce(reviewed),
        findOne: jest.fn().mockResolvedValue({ createdAt: oldestAt }),
      };
    }

    const resourceReports = reportCollection(
      2,
      4,
      new Date('2026-09-20T12:00:00.000Z'),
    );
    const qaReports = reportCollection(
      3,
      5,
      new Date('2026-09-19T12:00:00.000Z'),
    );
    const organizationReports = reportCollection(
      1,
      6,
      new Date('2026-09-21T12:00:00.000Z'),
    );

    const pilotEvents = {
      countDocuments: pilotEventCounts,
      aggregate: pilotEventAggregate,
    };

    const collections: Record<string, unknown> = {
      users: { aggregate: usersAggregate },
      pilot_events: pilotEvents,
      resource_reports: resourceReports,
      qa_reports: qaReports,
      organization_reports: organizationReports,
      academic_subject_participations: { aggregate: subjectAggregate },
    };

    const connection = {
      collection: jest.fn((name: string) => collections[name]),
    };

    const store = new MongoPilotStore(connection as never, {} as never);
    const result = await store.metrics({
      from: FROM,
      to: TO,
      previousFrom: PREVIOUS_FROM,
      previousTo: PREVIOUS_TO,
      days: 14,
    });

    expect(result.activity).toEqual({
      activeUsers: 8,
      returningUsers: 4,
    });
    expect(result.audience).toEqual({
      activeStudents: { activeUsers: 5, returningUsers: 3 },
      alumni: { activeUsers: 2, returningUsers: 1 },
      community: { activeUsers: 1, returningUsers: 0 },
    });
    expect(result.contributions).toEqual({
      events: 12,
      contributors: 6,
    });
    expect(result.subjects).toHaveLength(PILOT_SUBJECT_METRICS_LIMIT);
    expect(result.subjectsTruncated).toBe(true);
    expect(result.moderation).toEqual({
      pending: 6,
      reviewedInWindow: 15,
      oldestPendingAt: new Date('2026-09-19T12:00:00.000Z'),
    });

    expect('distinct' in pilotEvents).toBe(false);
    expect(pilotEventAggregate).toHaveBeenCalledTimes(2);

    const audiencePipeline = pilotEventAggregate.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >;
    expect(audiencePipeline.some((stage) => '$lookup' in stage)).toBe(true);
    expect(audiencePipeline.some((stage) => '$group' in stage)).toBe(true);

    const contributorPipeline = pilotEventAggregate.mock.calls[1]?.[0] as Array<
      Record<string, unknown>
    >;
    expect(contributorPipeline.at(-1)).toEqual({ $count: 'count' });

    const subjectPipeline = subjectAggregate.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >;
    expect(
      subjectPipeline.filter((stage) => '$unionWith' in stage),
    ).toHaveLength(3);
    expect(subjectPipeline.at(-1)).toEqual({
      $limit: PILOT_SUBJECT_METRICS_LIMIT + 1,
    });
  });

  it('returns zero audience/contributors and an untruncated empty subject set', async () => {
    const users = {
      aggregate: jest.fn().mockReturnValue(aggregation([])),
    };
    const pilotEvents = {
      countDocuments: jest.fn().mockResolvedValue(0),
      aggregate: jest
        .fn()
        .mockReturnValueOnce(aggregation([]))
        .mockReturnValueOnce(aggregation([])),
    };
    const emptyReports = {
      countDocuments: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const subjects = {
      aggregate: jest.fn().mockReturnValue(aggregation([])),
    };

    const connection = {
      collection: jest.fn((name: string) => {
        if (name === 'users') return users;
        if (name === 'pilot_events') return pilotEvents;
        if (name === 'academic_subject_participations') return subjects;
        return emptyReports;
      }),
    };

    const store = new MongoPilotStore(connection as never, {} as never);
    const result = await store.metrics({
      from: FROM,
      to: TO,
      previousFrom: PREVIOUS_FROM,
      previousTo: PREVIOUS_TO,
      days: 14,
    });

    expect(result.activity).toEqual({
      activeUsers: 0,
      returningUsers: 0,
    });
    expect(result.audience).toEqual({
      activeStudents: { activeUsers: 0, returningUsers: 0 },
      alumni: { activeUsers: 0, returningUsers: 0 },
      community: { activeUsers: 0, returningUsers: 0 },
    });
    expect(result.contributions.contributors).toBe(0);
    expect(result.subjects).toEqual([]);
    expect(result.subjectsTruncated).toBe(false);
  });
});
