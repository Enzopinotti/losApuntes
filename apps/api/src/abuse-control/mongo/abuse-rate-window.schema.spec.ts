import { AbuseRateWindowSchema } from './abuse-rate-window.schema';

describe('AbuseRateWindowSchema', () => {
  it('has unique opaque key and TTL expiry indexes', () => {
    const indexes = AbuseRateWindowSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.tuple([
          { key: 1 },
          expect.objectContaining({ unique: true }),
        ]),
        expect.tuple([
          { expiresAt: 1 },
          expect.objectContaining({ expireAfterSeconds: 0 }),
        ]),
      ]),
    );
  });

  it('does not define raw identity fields', () => {
    const paths = Object.keys(AbuseRateWindowSchema.paths);

    expect(paths).not.toEqual(
      expect.arrayContaining(['ip', 'email', 'target', 'token', 'userId']),
    );
  });
});
