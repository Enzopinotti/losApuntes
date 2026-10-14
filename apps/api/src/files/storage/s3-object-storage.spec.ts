import { createS3ObjectStorage } from './s3-object-storage';

const now = new Date('2026-09-23T13:00:00.000Z');

function storage() {
  return createS3ObjectStorage({
    endpoint: 'http://object-storage:9000',
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
      'response-cache-control',
      'response-content-disposition',
      'response-content-type',
    ]);
    expect(url.searchParams.get('response-cache-control')).toBe(
      'private, no-store',
    );
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

  it('streams full objects in bounded chunks for safety scanners', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('abcdefghij'), { status: 200 }),
      );
    const chunks: Buffer[] = [];

    for await (const chunk of storage().readObjectChunks('scan-me', 1024)) {
      chunks.push(Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks).toString('utf8')).toBe('abcdefghij');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const invalidRead = storage()
      .readObjectChunks('x', 1)
      [Symbol.asyncIterator]()
      .next();
    await expect(invalidRead).rejects.toThrow(
      'maximumChunkBytes must be an integer between 1024 and 1048576',
    );
  });

  it('cancels the provider response when a downstream stream stops early', async () => {
    let cancelled = false;
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) return;
        controller.enqueue(Buffer.from('first chunk'));
        sent = true;
      },
      cancel() {
        cancelled = true;
      },
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(body, { status: 200 }));
    const reader = storage()
      .readObjectChunks('cancel-me', 1024)
      [Symbol.asyncIterator]();

    await expect(reader.next()).resolves.toMatchObject({
      done: false,
      value: Buffer.from('first chunk'),
    });
    await reader.return?.();

    expect(cancelled).toBe(true);
  });

  it('cancels a pending provider read when the download signal aborts', async () => {
    let cancelled = false;
    let sent = false;
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull(streamController) {
        if (sent) return;
        streamController.enqueue(Buffer.from('first chunk'));
        sent = true;
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(body, { status: 200 }));
    const reader = storage()
      .readObjectChunks('abort-pending-read', 1024, controller.signal)
      [Symbol.asyncIterator]();

    await expect(reader.next()).resolves.toMatchObject({
      done: false,
      value: Buffer.from('first chunk'),
    });
    const pendingRead = reader.next();
    controller.abort();

    await expect(pendingRead).resolves.toMatchObject({ done: true });
    expect(cancelled).toBe(true);
    expect(fetchSpy.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
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

  it('uses a single private PUT for artifacts smaller than the multipart part size', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/generation.json',
      contentType: 'application/json; charset=utf-8',
    });

    await writer.write(Buffer.from('{"ready":true}', 'utf8'));
    await writer.complete();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(new URL(fetchSpy.mock.calls[0]?.[0] as string).search).toBe('');
    expect(
      Buffer.from(fetchSpy.mock.calls[0]?.[1]?.body as Uint8Array).toString(),
    ).toBe('{"ready":true}');
    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toContain('SignedHeaders=');
    expect(headers.get('x-amz-content-sha256')).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('uploads large artifacts in bounded parts and completes the exact S3 generation', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"abcdef0123456789"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"fedcba9876543210"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('<CompleteMultipartUploadResult/>', { status: 200 }),
      );
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/generation.json',
      contentType: 'application/json; charset=utf-8',
    });

    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await writer.write(Buffer.from('tail', 'utf8'));
    await writer.complete();

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'PUT',
      'POST',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[0]?.[0] as string).searchParams.has(
        'uploads',
      ),
    ).toBe(true);
    const partUrl = new URL(fetchSpy.mock.calls[1]?.[0] as string);
    expect(partUrl.searchParams.get('partNumber')).toBe('1');
    expect(partUrl.searchParams.get('uploadId')).toBe('upload-1');
    expect((fetchSpy.mock.calls[1]?.[1]?.body as Buffer).byteLength).toBe(
      5 * 1024 * 1024,
    );
    const completion = Buffer.from(
      fetchSpy.mock.calls[3]?.[1]?.body as Uint8Array,
    ).toString('utf8');
    expect(completion).toContain('<ETag>"abcdef0123456789"</ETag>');
    expect(completion).toContain('<PartNumber>2</PartNumber>');
  });

  it('aborts partial multipart data and deletes any generation object idempotently', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"abcdef0123456789"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/generation.json',
      contentType: 'application/json; charset=utf-8',
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));

    await writer.abort();
    await expect(writer.write(Buffer.from('late'))).rejects.toThrow(
      'S3 multipart writer is no longer writable',
    );
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[2]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('upload-1');
  });
});
