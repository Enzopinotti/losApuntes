import type {
  FileSafetyScanInput,
  FileSafetyScanner,
} from './file-safety-scanner';

const QUARANTINE_TEST_MARKER = Buffer.from(
  'LOSAPUNTES-QUARANTINE-TEST-MARKER-V1',
  'ascii',
);

export function createDeterministicFileSafetyScanner(): FileSafetyScanner {
  return Object.freeze({
    async scan(input: FileSafetyScanInput) {
      let seenBytes = 0;
      let carry = Buffer.alloc(0);

      for await (const chunk of input.chunks) {
        seenBytes += chunk.byteLength;
        if (seenBytes > input.byteSize) {
          throw new Error('Scanner stream exceeded verified byte size');
        }

        const bytes = Buffer.concat([carry, Buffer.from(chunk)]);
        if (bytes.includes(QUARANTINE_TEST_MARKER)) {
          return {
            verdict: 'malicious' as const,
            engine: 'deterministic-quarantine-v1',
          };
        }

        const carryBytes = Math.max(
          0,
          QUARANTINE_TEST_MARKER.byteLength - 1,
        );
        carry = bytes.subarray(Math.max(0, bytes.byteLength - carryBytes));
      }

      if (seenBytes !== input.byteSize) {
        throw new Error('Scanner stream did not match verified byte size');
      }

      return {
        verdict: 'clean' as const,
        engine: 'deterministic-quarantine-v1',
      };
    },
  });
}
