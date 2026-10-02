import type { ResourceFileMimeType } from '../domain/file.types';

export type FileSafetyVerdict = 'clean' | 'malicious';

export type FileSafetyScanResult = {
  verdict: FileSafetyVerdict;
  engine: string;
};

export type FileSafetyScanInput = {
  chunks: AsyncIterable<Uint8Array>;
  byteSize: number;
  mimeType: ResourceFileMimeType;
};

export type FileSafetyProbeResult = {
  status: 'ok';
  engine: string;
};

export interface FileSafetyScanner {
  scan(input: FileSafetyScanInput): Promise<FileSafetyScanResult>;
  probe(timeoutMs?: number): Promise<FileSafetyProbeResult>;
}

export async function probeFileSafetyScanner(
  scanner: FileSafetyScanner,
  timeoutMs: number,
): Promise<'ok' | 'failed'> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      scanner.probe(timeoutMs),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('File safety scanner probe timed out')),
          timeoutMs,
        );
      }),
    ]);
    return 'ok';
  } catch {
    return 'failed';
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const FILE_SAFETY_SCANNER = Symbol('FILE_SAFETY_SCANNER');

export const TEST_CLEAN_FILE_SAFETY_SCANNER: FileSafetyScanner = Object.freeze({
  scan: () =>
    Promise.resolve({
      verdict: 'clean' as const,
      engine: 'test-clean-v1',
    }),
  probe: () =>
    Promise.resolve({
      status: 'ok' as const,
      engine: 'test-clean-v1',
    }),
});

export const FAIL_CLOSED_FILE_SAFETY_SCANNER: FileSafetyScanner = Object.freeze(
  {
    scan: () => Promise.reject(new Error('File safety scanner is unavailable')),
    probe: () =>
      Promise.reject(new Error('File safety scanner is unavailable')),
  },
);
