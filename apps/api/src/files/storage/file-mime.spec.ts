import { normalizeResourceMimeType, verifyResourceMimeType } from './file-mime';

describe('resource MIME verification', () => {
  it.each([
    ['application/pdf', Buffer.from('%PDF-1.7'), 'application/pdf'],
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'],
    [
      'image/png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/png',
    ],
    ['image/webp', Buffer.from('RIFF0000WEBP'), 'image/webp'],
  ])('accepts matching %s signatures', (declared, bytes, expected) => {
    expect(verifyResourceMimeType(new Uint8Array(bytes), declared)).toBe(
      expected,
    );
  });

  it('normalizes common MIME spelling and parameters', () => {
    expect(normalizeResourceMimeType(' image/jpg; charset=binary ')).toBe(
      'image/jpeg',
    );
  });

  it('rejects truncated and mismatched image signatures', () => {
    expect(
      verifyResourceMimeType(new Uint8Array([0xff, 0xd8]), 'image/jpeg'),
    ).toBeNull();
    expect(
      verifyResourceMimeType(
        new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
        'image/png',
      ),
    ).toBeNull();
    expect(
      verifyResourceMimeType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/jpeg',
      ),
    ).toBeNull();
    expect(
      verifyResourceMimeType(
        new Uint8Array(Buffer.from('RIFF0000NOPE')),
        'image/webp',
      ),
    ).toBeNull();
    expect(
      verifyResourceMimeType(
        new Uint8Array(Buffer.from('RIFF0000WEBP')),
        'image/png',
      ),
    ).toBeNull();
  });

  it('rejects unsupported or spoofed bytes', () => {
    expect(normalizeResourceMimeType('text/html')).toBeNull();
    expect(
      verifyResourceMimeType(
        new Uint8Array(Buffer.from('%PDF-1.7')),
        'image/png',
      ),
    ).toBeNull();
  });
});
