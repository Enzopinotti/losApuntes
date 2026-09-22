import { ConfigService } from '@nestjs/config';

import { requireConfigString } from './required-config';

describe('requireConfigString', () => {
  it('returns a trimmed configured value', () => {
    const config = new ConfigService({ JWT_SECRET: '  secret  ' });

    expect(requireConfigString(config, 'JWT_SECRET')).toBe('secret');
  });

  it.each([undefined, null, '', '   '])(
    'rejects missing or blank values: %p',
    (value) => {
      const config = new ConfigService({ JWT_SECRET: value });

      expect(() => requireConfigString(config, 'JWT_SECRET')).toThrow(
        'JWT_SECRET is required',
      );
    },
  );
});
