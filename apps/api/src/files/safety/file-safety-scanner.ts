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

export interface FileSafetyScanner {
  scan(input: FileSafetyScanInput): Promise<FileSafetyScanResult>;
}

export const FILE_SAFETY_SCANNER = Symbol('FILE_SAFETY_SCANNER');

export const TEST_CLEAN_FILE_SAFETY_SCANNER: FileSafetyScanner = Object.freeze({
  scan: () =>
    Promise.resolve({
      verdict: 'clean' as const,
      engine: 'test-clean-v1',
    }),
});

export const FAIL_CLOSED_FILE_SAFETY_SCANNER: FileSafetyScanner = Object.freeze(
  {
    scan: () => Promise.reject(new Error('File safety scanner is unavailable')),
  },
);
