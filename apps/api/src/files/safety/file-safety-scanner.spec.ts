import {
  FAIL_CLOSED_FILE_SAFETY_SCANNER,
  TEST_CLEAN_FILE_SAFETY_SCANNER,
  probeFileSafetyScanner,
  type FileSafetyScanner,
} from './file-safety-scanner';

describe('FileSafetyScanner health probe', () => {
  it('reports healthy adapters without exposing adapter details', async () => {
    await expect(
      probeFileSafetyScanner(TEST_CLEAN_FILE_SAFETY_SCANNER, 25),
    ).resolves.toBe('ok');
  });

  it('collapses adapter failures to a bounded failed status', async () => {
    await expect(
      probeFileSafetyScanner(FAIL_CLOSED_FILE_SAFETY_SCANNER, 25),
    ).resolves.toBe('failed');
  });

  it('bounds a future adapter that never resolves', async () => {
    const hanging: FileSafetyScanner = {
      scan: () => Promise.reject(new Error('not used')),
      probe: () => new Promise(() => undefined),
    };
    const startedAt = Date.now();

    await expect(probeFileSafetyScanner(hanging, 10)).resolves.toBe('failed');
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
