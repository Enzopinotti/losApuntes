import { createHash } from 'node:crypto';

import { AccountExportAssembler } from './account-export-assembler';
import { AccountExportContributorRegistry } from './account-export-contributor.registry';
import { AccountExportService } from './account-export.service';
import type { AccountExportArtifactSink } from './account-export-assembler';
import type { AccountExportContributor } from './account-export.types';

type SinkFixture = AccountExportArtifactSink & {
  chunks: string[];
  write: jest.Mock;
  commit: jest.Mock;
  abort: jest.Mock;
};

function sinkFixture(): SinkFixture {
  const output: SinkFixture = {
    chunks: [],
    write: jest.fn((chunk: string) => {
      output.chunks.push(chunk);
      return Promise.resolve();
    }),
    commit: jest.fn().mockResolvedValue(undefined),
    abort: jest.fn().mockResolvedValue(undefined),
  };
  return output;
}

function contributor(
  sectionId: string,
  readPage: AccountExportContributor['readPage'],
): AccountExportContributor {
  return { sectionId, readPage };
}

function assemblerFor(
  contributors: AccountExportContributor[],
  hasActiveAccount = jest.fn().mockResolvedValue(true),
) {
  const registry = new AccountExportContributorRegistry(contributors);
  const service = new AccountExportService(
    {} as never,
    { hasActiveAccount } as never,
  );
  return new AccountExportAssembler(registry, service);
}

describe('AccountExportAssembler', () => {
  it('writes deterministic versioned JSON in registry order', async () => {
    const output = sinkFixture();
    output.commit.mockImplementation(() => {
      expect(output.chunks.join('').endsWith('}}')).toBe(true);
      return Promise.resolve();
    });
    const assembler = assemblerFor([
      contributor('profile', () =>
        Promise.resolve({
          records: [{ displayName: 'Ada' }],
          nextCursor: null,
        }),
      ),
      contributor('account', () =>
        Promise.resolve({
          records: [{ id: 'user-1' }],
          nextCursor: null,
        }),
      ),
    ]);

    const result = await assembler.writeJsonV1('user-1', output);
    const artifact = output.chunks.join('');

    expect(result).toEqual({
      format: 'los-apuntes-account-export',
      formatVersion: 1,
      sectionCount: 2,
      recordCount: 2,
      byteLength: Buffer.byteLength(artifact, 'utf8'),
      sha256: createHash('sha256').update(artifact, 'utf8').digest('hex'),
    });

    expect(artifact).toBe(
      '{"format":"los-apuntes-account-export","version":1,"sections":{"account":[{"id":"user-1"}],"profile":[{"displayName":"Ada"}]}}',
    );
    expect(artifact.endsWith('}}')).toBe(true);
    expect(output.commit.mock.calls).toEqual([[result]]);
  });

  it('measures UTF-8 bytes and hashes the exact streamed envelope', async () => {
    const output = sinkFixture();
    const assembler = assemblerFor([
      contributor('profile', () =>
        Promise.resolve({
          records: [{ displayName: 'Ada 🎓' }],
          nextCursor: null,
        }),
      ),
    ]);

    const result = await assembler.writeJsonV1('user-1', output);
    const artifact = output.chunks.join('');

    expect(result.byteLength).toBe(Buffer.byteLength(artifact, 'utf8'));
    expect(result.byteLength).toBeGreaterThan(artifact.length);
    expect(result.sha256).toBe(
      createHash('sha256').update(artifact, 'utf8').digest('hex'),
    );
  });

  it('aborts staged output when the owner becomes inactive before commit', async () => {
    const output = sinkFixture();
    const hasActiveAccount = jest.fn().mockResolvedValue(false);
    const assembler = assemblerFor(
      [
        contributor('profile', () =>
          Promise.resolve({
            records: [{ displayName: 'Ada' }],
            nextCursor: null,
          }),
        ),
      ],
      hasActiveAccount,
    );

    await expect(assembler.writeJsonV1('user-1', output)).rejects.toMatchObject(
      { response: { code: 'ACCOUNT_EXPORT_ACCOUNT_INACTIVE' } },
    );

    expect(output.chunks.join('').endsWith('}}')).toBe(true);
    expect(hasActiveAccount.mock.calls).toEqual([['user-1']]);
    expect(output.commit.mock.calls).toHaveLength(0);
    expect(output.abort.mock.calls).toEqual([[]]);
  });

  it('aborts staged output and preserves account-state read failures before commit', async () => {
    const output = sinkFixture();
    const readError = new Error('account state unavailable');
    const hasActiveAccount = jest.fn().mockRejectedValue(readError);
    const assembler = assemblerFor(
      [
        contributor('profile', () =>
          Promise.resolve({ records: [], nextCursor: null }),
        ),
      ],
      hasActiveAccount,
    );

    await expect(assembler.writeJsonV1('user-1', output)).rejects.toBe(
      readError,
    );

    expect(hasActiveAccount.mock.calls).toEqual([['user-1']]);
    expect(output.commit.mock.calls).toHaveLength(0);
    expect(output.abort.mock.calls).toEqual([[]]);
  });

  it('streams every bounded page before asking the contributor for the next', async () => {
    const output = sinkFixture();
    const readPage = jest.fn(({ cursor }: { cursor: string | null }) => {
      if (cursor === null) {
        return Promise.resolve({
          records: [{ id: 'first' }],
          nextCursor: 'page-2',
        });
      }
      expect(output.chunks.join('')).toContain('{"id":"first"}');
      return Promise.resolve({
        records: [{ id: 'second' }],
        nextCursor: null,
      });
    });
    const assembler = assemblerFor([
      contributor('profile.activities', readPage),
    ]);

    await expect(
      assembler.writeJsonV1('user-1', output),
    ).resolves.toMatchObject({
      recordCount: 2,
      sectionCount: 1,
    });

    expect(readPage).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      cursor: null,
      limit: 100,
    });
    expect(readPage).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      cursor: 'page-2',
      limit: 100,
    });
    expect(output.chunks.join('')).toContain(
      '"profile.activities":[{"id":"first"},{"id":"second"}]',
    );
  });

  it('waits for sink backpressure before reading any contributor page', async () => {
    let releaseFirstWrite!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const readPage = jest.fn().mockResolvedValue({
      records: [],
      nextCursor: null,
    });
    const output = sinkFixture();
    output.write.mockImplementationOnce(async (chunk: string) => {
      output.chunks.push(chunk);
      await firstWrite;
    });
    const assembler = assemblerFor([contributor('account', readPage)]);

    const writing = assembler.writeJsonV1('user-1', output);
    await Promise.resolve();
    expect(readPage).not.toHaveBeenCalled();

    releaseFirstWrite();
    await writing;
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it('aborts partial output when a contributor repeats a cursor', async () => {
    const output = sinkFixture();
    const readPage = jest.fn(({ cursor }: { cursor: string | null }) => {
      if (cursor === null) {
        return Promise.resolve({ records: [], nextCursor: 'cursor-a' });
      }
      if (cursor === 'cursor-a') {
        return Promise.resolve({ records: [], nextCursor: 'cursor-b' });
      }
      return Promise.resolve({ records: [], nextCursor: 'cursor-a' });
    });
    const assembler = assemblerFor([
      contributor('profile.activities', readPage),
    ]);

    await expect(assembler.writeJsonV1('user-1', output)).rejects.toThrow(
      'repeated a cursor',
    );

    expect(readPage).toHaveBeenCalledTimes(4);
    expect(output.abort.mock.calls).toHaveLength(1);
    expect(output.chunks.join('')).not.toContain('}}');
  });

  it('aborts when a contributor returns a record that cannot be serialized', async () => {
    const output = sinkFixture();
    const assembler = assemblerFor([
      contributor('account', () =>
        Promise.resolve({
          records: [{ toJSON: () => undefined }] as never,
          nextCursor: null,
        }),
      ),
    ]);

    await expect(assembler.writeJsonV1('user-1', output)).rejects.toThrow(
      'produced a non-JSON record',
    );

    expect(output.abort.mock.calls).toHaveLength(1);
  });

  it('aborts when a contributor returns an empty continuation cursor', async () => {
    const output = sinkFixture();
    const assembler = assemblerFor([
      contributor('account', () =>
        Promise.resolve({ records: [], nextCursor: '' }),
      ),
    ]);

    await expect(assembler.writeJsonV1('user-1', output)).rejects.toThrow(
      'produced an invalid cursor',
    );

    expect(output.abort.mock.calls).toHaveLength(1);
  });

  it('aborts partial output when a sink write fails and preserves that failure', async () => {
    const output = sinkFixture();
    const failure = new Error('storage stream failed');
    output.write.mockImplementation((chunk: string) => {
      if (chunk === '{"id":"bad"}') return Promise.reject(failure);
      output.chunks.push(chunk);
      return Promise.resolve();
    });
    const assembler = assemblerFor([
      contributor('account', () =>
        Promise.resolve({
          records: [{ id: 'bad' }],
          nextCursor: null,
        }),
      ),
    ]);

    await expect(assembler.writeJsonV1('user-1', output)).rejects.toBe(failure);
    expect(output.abort.mock.calls).toEqual([[]]);
    expect(output.commit.mock.calls).toHaveLength(0);
  });

  it('aborts and preserves the failure when the complete artifact cannot be committed', async () => {
    const output = sinkFixture();
    const failure = new Error('artifact commit failed');
    output.commit.mockRejectedValue(failure);
    const assembler = assemblerFor([
      contributor('account', () =>
        Promise.resolve({ records: [{ id: 'user-1' }], nextCursor: null }),
      ),
    ]);

    await expect(assembler.writeJsonV1('user-1', output)).rejects.toBe(failure);

    expect(output.chunks.join('').endsWith('}}')).toBe(true);
    expect(output.commit.mock.calls).toHaveLength(1);
    expect(output.abort.mock.calls).toEqual([[]]);
  });
});
