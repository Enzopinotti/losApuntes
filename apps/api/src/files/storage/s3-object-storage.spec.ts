import { createS3ObjectStorage } from './s3-object-storage';

const now = new Date('2026-09-23T13:00:00.000Z');

function storage() {
  return createS3ObjectStorage({
    endpoint: 'http://minio:9000',
    publicEndpoint: 'http://localhost:9000',
    bucket: 'losapuntes-files',
    region: 'us-east-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    now: () => now,
  });
}

describe('S3ObjectStorage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('presigns immutable PUTs with exact byte length and deterministic expiry', async () => {
    const result = await storage().createUploadIntent({
      objectKey: 'resource-assets/id/archivo final.pdf',
      contentType: 'application/pdf',
      contentLength: 123,
      expiresInSeconds: 600,
    });
    const url = new URL(result.url);

    expect(url.origin).toBe('http://localhost:9000');
    expect(url.pathname).toContain('/losapuntes-files/resource-assets/id/');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20260923T130000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host;if-none-match',
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.headers).toEqual({
      'content-type': 'application/pdf',
      'if-none-match': '*',
    });
    expect(result.headers).not.toHaveProperty('content-length');
    expect(result.expiresAt.toISOString()).toBe('2026-09-23T13:10:00.000Z');
  });

  it('uses SigV4 byte-order query sorting for response metadata', async () => {
    const result = await storage().createDownloadIntent({
      objectKey: 'resource-assets/id/file.pdf',
      filename: 'Parcial á "final".pdf',
      contentType: 'application/pdf',
      disposition: 'attachment',
      expiresInSeconds: 300,
    });
    const url = new URL(result.url);
    const rawKeys = url.search
      .slice(1)
      .split('&')
      .map((part) => part.split('=', 1)[0]);

    expect(rawKeys).toEqual([
      'X-Amz-Algorithm',
      'X-Amz-Credential',
      'X-Amz-Date',
      'X-Amz-Expires',
      'X-Amz-Signature',
      'X-Amz-SignedHeaders',
      'response-content-disposition',
      'response-content-type',
    ]);
    expect(url.searchParams.get('response-content-type')).toBe(
      'application/pdf',
    );
    expect(url.searchParams.get('response-content-disposition')).toContain(
      "filename*=UTF-8''",
    );
    expect(result.expiresAt.toISOString()).toBe('2026-09-23T13:05:00.000Z');
  });

  it('rejects invalid endpoint roots and invalid presign expiries', () => {
    expect(() =>
      createS3ObjectStorage({
        endpoint: 'ftp://storage.test',
        bucket: 'bucket',
        region: 'us-east-1',
        accessKeyId: 'id',
        secretAccessKey: 'secret',
      }),
    ).toThrow('FILES_S3_ENDPOINT must be an HTTP(S) root origin');

    expect(() =>
      createS3ObjectStorage({
        endpoint: 'https://user:pass@storage.test',
        bucket: 'bucket',
        region: 'us-east-1',
        accessKeyId: 'id',
        secretAccessKey: 'secret',
      }),
    ).toThrow('FILES_S3_ENDPOINT must be an HTTP(S) root origin');

    expect(() =>
      createS3ObjectStorage({
        endpoint: 'https://storage.test/path',
        bucket: 'bucket',
        region: 'us-east-1',
        accessKeyId: 'id',
        secretAccessKey: 'secret',
      }),
    ).toThrow('FILES_S3_ENDPOINT must be an HTTP(S) root origin');

    const value = storage();
    expect(() =>
      value.createUploadIntent({
        objectKey: 'x',
        contentType: 'application/pdf',
        contentLength: 1,
        expiresInSeconds: 0,
      }),
    ).toThrow('S3 presign expiry must be between 1 and 3600 seconds');
    expect(() =>
      value.createDownloadIntent({
        objectKey: 'x',
        filename: 'x.pdf',
        contentType: 'application/pdf',
        disposition: 'inline',
        expiresInSeconds: 3601,
      }),
    ).toThrow('S3 presign expiry must be between 1 and 3600 seconds');
  });

  it('HEADs objects with signed server credentials and normalizes metadata', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: {
            'content-length': '8',
            'content-type': 'application/pdf',
            etag: '"etag-1"',
          },
        }),
      );

    await expect(storage().headObject('missing')).resolves.toBeNull();
    await expect(storage().headObject('ready')).resolves.toEqual({
      byteSize: 8,
      contentType: 'application/pdf',
      etag: 'etag-1',
    });

    const second = fetchSpy.mock.calls[1];
    const headers = new Headers(second?.[1]?.headers);
    expect(headers.get('x-amz-date')).toBe('20260923T130000Z');
    expect(headers.get('authorization')).toContain(
      'Credential=test-access/20260923/us-east-1/s3/aws4_request',
    );
  });

  it('fails closed on bad HEAD metadata or storage errors', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-length': 'not-a-number' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(storage().headObject('bad-length')).rejects.toThrow(
      'S3 HEAD returned an invalid content length',
    );
    await expect(storage().headObject('unavailable')).rejects.toThrow(
      'S3 HEAD failed with HTTP 503',
    );
  });

  it('reads only bounded prefixes and rejects oversized provider responses', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('%PDF-1.7'), { status: 206 }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('123456789'), { status: 206 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(storage().readPrefix('file', 8)).resolves.toEqual(
      new Uint8Array(Buffer.from('%PDF-1.7')),
    );
    const firstHeaders = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(firstHeaders.get('range')).toBe('bytes=0-7');

    await expect(storage().readPrefix('too-large', 8)).rejects.toThrow(
      'S3 returned more bytes than the requested prefix',
    );
    await expect(storage().readPrefix('failure', 8)).rejects.toThrow(
      'S3 GET prefix failed with HTTP 500',
    );
    await expect(storage().readPrefix('invalid', 0)).rejects.toThrow(
      'maximumBytes must be a positive integer',
    );
  });

  it('treats delete 404 as idempotent and surfaces provider failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(storage().deleteObject('missing')).resolves.toBeUndefined();
    await expect(storage().deleteObject('present')).resolves.toBeUndefined();
    await expect(storage().deleteObject('failure')).rejects.toThrow(
      'S3 DELETE failed with HTTP 500',
    );
  });

  it('supports the internal endpoint as public endpoint and a custom provider id', async () => {
    const value = createS3ObjectStorage({
      endpoint: 'https://storage.test',
      bucket: 'bucket',
      region: 'sa-east-1',
      accessKeyId: 'id',
      secretAccessKey: 'secret',
      providerId: 'compatible',
      now: () => now,
    });

    expect(value.providerId).toBe('compatible');
    const result = await value.createDownloadIntent({
      objectKey: 'x',
      filename: '',
      contentType: 'image/png',
      disposition: 'inline',
      expiresInSeconds: 1,
    });
    expect(new URL(result.url).origin).toBe('https://storage.test');
    expect(
      new URL(result.url).searchParams.get('response-content-disposition'),
    ).toContain('filename="download"');
  });
});
