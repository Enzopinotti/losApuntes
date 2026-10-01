import type {
  FileSafetyScanInput,
  FileSafetyScanner,
} from './file-safety-scanner';

const EICAR_MARKER = Buffer.from(
  'X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
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
        if (bytes.includes(EICAR_MARKER)) {
          return {
            verdict: 'malicious' as const,
            engine: 'deterministic-eicar-v1',
          };
        }

        const carryBytes = Math.max(0, EICAR_MARKER.byteLength - 1);
        carry = bytes.subarray(Math.max(0, bytes.byteLength - carryBytes));
      }

      if (seenBytes !== input.byteSize) {
        throw new Error('Scanner stream did not match verified byte size');
      }

      return {
        verdict: 'clean' as const,
        engine: 'deterministic-eicar-v1',
      };
    },
  });
}
