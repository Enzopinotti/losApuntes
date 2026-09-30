import { filesWorkerHealthValidityMs, isFilesWorkerHealthCurrent } from './files-worker-health';

describe('Files worker health marker', () => {
  it('uses a bounded validity window derived from the cleanup interval', () => {
    expect(filesWorkerHealthValidityMs(1_000)).toBe(30_000);
    expect(filesWorkerHealthValidityMs(5 * 60 * 1000)).toBe(15 * 60 * 1000);
    expect(filesWorkerHealthValidityMs(60 * 60 * 1000)).toBe(30 * 60 * 1000);
  });

  it('accepts only fresh ready snapshots', () => {
    const now = Date.parse('2026-09-30T00:00:00.000Z');

    expect(
      isFilesWorkerHealthCurrent(
        {
          status: 'ready',
          checkedAt: '2026-09-29T23:59:59.000Z',
          expiresAt: '2026-09-30T00:00:01.000Z',
        },
        now,
      ),
    ).toBe(true);

    expect(
      isFilesWorkerHealthCurrent(
        {
          status: 'not_ready',
          checkedAt: '2026-09-29T23:59:59.000Z',
          expiresAt: '2026-09-30T00:00:01.000Z',
        },
        now,
      ),
    ).toBe(false);

    expect(
      isFilesWorkerHealthCurrent(
        {
          status: 'ready',
          checkedAt: '2026-09-29T23:59:00.000Z',
          expiresAt: '2026-09-29T23:59:59.000Z',
        },
        now,
      ),
    ).toBe(false);
  });
});
