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

  it('B125 percent-encodes RFC 5987 punctuation and sanitizes untrusted display filenames', async () => {
    const value = await storage().createDownloadIntent({
      objectKey: 'resource-assets/id/private-file.pdf',
      filename: "Parcial '()+*.pdf\r\nX-Injected: yes",
      contentType: 'application/pdf',
      disposition: 'attachment',
      expiresInSeconds: 300,
    });
    const url = new URL(value.url);
    const contentDisposition = url.searchParams.get(
      'response-content-disposition',
    );
    expect(contentDisposition).toBe(
      'attachment; filename="Parcial \'()+*.pdf__X-Injected: yes"; ' +
        "filename*=UTF-8''Parcial%20%27%28%29%2B%2A.pdf%0D%0AX-Injected%3A%20yes",
    );
    expect(contentDisposition).not.toMatch(/[\r\n]/u);
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('B125 rejects malformed internal and public endpoint strings before creating a signed URL', () => {
    const config = {
      endpoint: 'http://object-storage:9000',
      publicEndpoint: 'http://localhost:9000',
      bucket: 'losapuntes-files',
      region: 'us-east-1',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
    };
    expect(() =>
      createS3ObjectStorage({ ...config, endpoint: 'not an absolute url' }),
    ).toThrow('FILES_S3_ENDPOINT must be an absolute HTTP(S) URL');
    expect(() =>
      createS3ObjectStorage({ ...config, publicEndpoint: 'not a url' }),
    ).toThrow('FILES_S3_PUBLIC_ENDPOINT must be an absolute HTTP(S) URL');
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

  it.each([202, 204, 206])(
    'B116 rejects ambiguous HTTP %s HEAD despite a plausible object length',
    async (status) => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(null, {
          status,
          headers: {
            'content-length': '8',
            'content-type': 'application/pdf',
            etag: '"looks-real"',
          },
        }),
      );
      await expect(
        storage().headObject('private/b116-unconfirmed'),
      ).rejects.toThrow('S3 HEAD failed with HTTP ' + status);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['', '01', '8e2', '+8', '8.0', '8, 8', '9007199254740992'])(
    'B116 rejects noncanonical HEAD Content-Length %j even on HTTP 200',
    async (invalidLength) => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-length': invalidLength },
        }),
      );
      await expect(
        storage().headObject('private/b116-bad-length'),
      ).rejects.toThrow('S3 HEAD returned an invalid content length');
    },
  );

  it('B116 does not accept successful HEAD without Content-Length', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(
      storage().headObject('private/b116-missing-length'),
    ).rejects.toThrow('S3 HEAD returned an invalid content length');
  });

  it.each([
    '"unbalanced',
    'unbalanced"',
    '"inside"quote"',
    'bad etag',
    'x'.repeat(255),
  ])(
    'B119 rejects a malformed present HEAD ETag %j without confirming metadata',
    async (invalidEtag) => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-length': '8', etag: invalidEtag },
        }),
      );
      await expect(
        storage().headObject('private/b119-invalid-etag'),
      ).rejects.toThrow('S3 HEAD returned an invalid ETag');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it('B119 keeps missing HEAD ETag optional on confirmed HTTP 200', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { 'content-length': '8' },
      }),
    );
    await expect(storage().headObject('private/b119-no-etag')).resolves.toEqual(
      {
        byteSize: 8,
        contentType: null,
        etag: null,
      },
    );
  });

  it('B119 preserves balanced multipart-format and compatible opaque HEAD ETags', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-length': '8', etag: '"abcd0123-2"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-length': '8', etag: 'compatible-opaque' },
        }),
      );
    const first = await storage().headObject('private/b119-multipart');
    const second = await storage().headObject('private/b119-compatible');
    expect(first?.etag).toBe('abcd0123-2');
    expect(second?.etag).toBe('compatible-opaque');
  });

  it('reads only bounded prefixes and rejects oversized provider responses', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('%PDF-1.7'), {
          status: 206,
          headers: { 'content-range': 'bytes 0-7/8' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('123456789'), { status: 200 }),
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

  it('B111 rejects HTTP 206 that reports a foreign offset or partial wrong window', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('12345678'), {
          status: 206,
          headers: { 'content-range': 'bytes 1-8/100' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('1234'), {
          status: 206,
          headers: { 'content-range': 'bytes 0-3/100' },
        }),
      );
    await expect(storage().readPrefix('b111-foreign', 8)).rejects.toThrow(
      'S3 GET prefix returned a mismatched Content-Range',
    );
    await expect(storage().readPrefix('b111-short-window', 8)).rejects.toThrow(
      'S3 GET prefix returned a mismatched Content-Range',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('B111 rejects truncated HTTP 206 body and absent Content-Range', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('1234'), {
          status: 206,
          headers: { 'content-range': 'bytes 0-7/100' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('12345678'), {
          status: 206,
        }),
      );
    await expect(storage().readPrefix('b111-truncated', 8)).rejects.toThrow(
      'S3 GET prefix returned a truncated Content-Range body',
    );
    await expect(storage().readPrefix('b111-unbound', 8)).rejects.toThrow(
      'S3 GET prefix returned an invalid Content-Range',
    );
  });

  it('B111 accepts HTTP 206 on a shorter complete object and HTTP 200 small body', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('%PDF'), {
          status: 206,
          headers: { 'content-range': 'bytes 0-3/4' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('%PDF'), {
          status: 200,
        }),
      );
    await expect(storage().readPrefix('b111-short-object', 8)).resolves.toEqual(
      new Uint8Array(Buffer.from('%PDF')),
    );
    await expect(storage().readPrefix('b111-200-compat', 8)).resolves.toEqual(
      new Uint8Array(Buffer.from('%PDF')),
    );
  });

  it.each([
    ['host', 'HOST spoof'],
    ['x-amz-date', 'timestamp override'],
    ['X-Amz-Content-Sha256', 'digest override'],
    ['Authorization', 'authorization override'],
    ['application/json\r\nx-amz-date: fake', 'newline injection'],
    ['application/json\u0000data', 'NUL injection'],
  ])(
    'B112 never starts multipart with unsafe signed content-type: %s (%s)',
    async (contentType) => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const writer = storage().createMultipartWriter({
        objectKey: 'exports/job/b112-header-rejected.json',
        contentType,
        deleteObjectOnAbort: false,
      });
      if (contentType.includes('\r\n') || contentType.includes('\u0000')) {
        await expect(
          writer.write(Buffer.alloc(5 * 1024 * 1024, 0x78)),
        ).rejects.toThrow(
          'S3 signed request contains an invalid or reserved header',
        );
        await expect(writer.complete()).rejects.toThrow(
          'S3 multipart writer cannot complete after a failed operation',
        );
        expect(fetchSpy).not.toHaveBeenCalled();
      } else {
        // Plain opaque content-types do not supply header *names*; they are
        // valid signed values even if their bytes resemble reserved names.
        const mockInit = new Response(
          '<InitiateMultipartUploadResult><UploadId>b112-value</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        );
        fetchSpy.mockResolvedValueOnce(mockInit).mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: { etag: '"part"' },
          }),
        );
        await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x79));
        expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
          'POST',
          'PUT',
        ]);
        const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
        expect(headers.get('authorization')).toContain(
          'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,',
        );
      }
    },
  );

  it.each([202, 204, 206])(
    'B113 rejects single PutObject HTTP %s without marking a private object complete',
    async (status) => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(null, { status }));
      const writer = storage().createMultipartWriter({
        objectKey: 'exports/private/b113-put.json',
        contentType: 'application/json',
        deleteObjectOnAbort: false,
      });
      await writer.write(Buffer.from('{"private":"b113"}'));
      await expect(writer.complete()).rejects.toThrow(
        'S3 PUT object failed with HTTP ' + status,
      );
      await expect(writer.complete()).rejects.toThrow(
        'S3 multipart writer cannot complete after a failed operation',
      );
      await writer.abort();
      expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
        'PUT',
      ]);
    },
  );

  it('B113 rejects HTTP 202 even when multipart initiation XML contains a plausible ID', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>b113-untrusted-id</UploadId></InitiateMultipartUploadResult>',
          { status: 202 },
        ),
      );
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/private/b113-init.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await expect(
      writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61)),
    ).rejects.toThrow('S3 Create multipart upload failed with HTTP 202');
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
    ]);
  });

  it('B113 rejects HTTP 206 part ACK even when it contains a valid ETag', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>b113-part</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 206,
          headers: { etag: '"valid-but-not-confirmed"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/private/b113-part.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await expect(
      writer.write(Buffer.alloc(5 * 1024 * 1024, 0x62)),
    ).rejects.toThrow('S3 Upload multipart part failed with HTTP 206');
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[2]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('b113-part');
  });

  it('B113 rejects HTTP 202 completion with valid-looking XML and only aborts uploadId', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>b113-complete</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"b113-part"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<CompleteMultipartUploadResult><ETag>"b113-ok"</ETag></CompleteMultipartUploadResult>',
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/private/b113-complete.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x63));
    await expect(writer.complete()).rejects.toThrow(
      'S3 Complete multipart upload failed with HTTP 202',
    );
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'POST',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[3]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('b113-complete');
  });

  it('B113 ambiguous HTTP 202 abort cannot be mistaken for completed cancellation', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>b113-abort</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"b113-part"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/private/b113-abort.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x64));
    await expect(writer.abort()).rejects.toThrow(
      'S3 Abort multipart upload failed with HTTP 202',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
      'DELETE',
    ]);
    const abortedIds = fetchSpy.mock.calls
      .slice(2)
      .map(([url]) => new URL(url as string).searchParams.get('uploadId'));
    expect(abortedIds).toEqual(['b113-abort', 'b113-abort']);
  });

  it('B112 signs content-type for multipart POST, PUT parts and completion', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>b112-parts</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"b112-part"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<CompleteMultipartUploadResult><ETag>"b112-complete"</ETag></CompleteMultipartUploadResult>',
          { status: 200 },
        ),
      );
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b112-positive.json',
      contentType: ' application/json;  charset=utf-8 ',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x79));
    await writer.complete();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'POST',
    ]);
    const startHeaders = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(startHeaders.get('content-type')).toBe(
      'application/json; charset=utf-8',
    );
    expect(startHeaders.get('authorization')).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,',
    );
    for (const [index, [, init]] of fetchSpy.mock.calls.slice(1).entries()) {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toContain(
        'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date,',
      );
      expect(headers.get('content-type')).toBe(
        index === 0 ? 'application/octet-stream' : 'application/xml',
      );
    }
  });

  it('B110 signs the exact Range value requested by the prefix GET', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(Buffer.from('%PDF-1.7'), {
        status: 206,
        headers: { 'content-range': 'bytes 0-7/8' },
      }),
    );
    await expect(
      storage().readPrefix('exports/owner/b110.pdf', 8),
    ).resolves.toEqual(new Uint8Array(Buffer.from('%PDF-1.7')));
    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('range')).toBe('bytes=0-7');
    expect(headers.get('authorization')).toContain(
      'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,',
    );
  });

  it('B110 retains the original signed header set for HEAD and full GET', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-length': '2' },
        }),
      )
      .mockResolvedValueOnce(new Response(Buffer.from('OK'), { status: 200 }));
    await storage().headObject('exports/b110-full.json');
    const received: Buffer[] = [];
    for await (const chunk of storage().readObjectChunks(
      'exports/b110-full.json',
    )) {
      received.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(received).toString()).toBe('OK');
    for (const call of fetchSpy.mock.calls) {
      const headers = new Headers(call[1]?.headers);
      expect(headers.get('range')).toBeNull();
      expect(headers.get('authorization')).toContain(
        'SignedHeaders=host;x-amz-content-sha256;x-amz-date,',
      );
    }
  });

  it('B109 cancels an oversized streamed GET prefix before full buffering', async () => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.alloc(64 * 1024 + 1, 0x61));
      },
      cancel() {
        cancelled++;
      },
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(body, { status: 200 }));
    await expect(
      storage().readPrefix('exports/private/b109.pdf', 8),
    ).rejects.toThrow('S3 returned more bytes than the requested prefix');
    expect(cancelled).toBe(1);
    const headers = new Headers(fetchSpy.mock.calls[0]?.[1]?.headers);
    expect(headers.get('range')).toBe('bytes=0-7');
  });

  it('B109 cancels a progressive prefix overflow with a small byte budget', async () => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('1234567'));
        controller.enqueue(Buffer.from('89'));
      },
      cancel() {
        cancelled++;
      },
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(body, { status: 200 }));
    await expect(
      storage().readPrefix('exports/private/b109-progressive.pdf', 8),
    ).rejects.toThrow('S3 returned more bytes than the requested prefix');
    expect(cancelled).toBe(1);
  });

  it('B109 retains exact-byte prefix output and accepts an empty response body', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('%PDF-1.7'), {
          status: 206,
          headers: { 'content-range': 'bytes 0-7/8' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(storage().readPrefix('b109-valid.pdf', 8)).resolves.toEqual(
      new Uint8Array(Buffer.from('%PDF-1.7')),
    );
    await expect(storage().readPrefix('b109-empty.pdf', 8)).resolves.toEqual(
      new Uint8Array(),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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

  it.each([202, 206])(
    'B114 rejects HTTP %s on full object GET without yielding untrusted bytes',
    async (status) => {
      let cancelled = 0;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from('part-only'));
        },
        cancel() {
          cancelled++;
        },
      });
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(body, { status }));
      const seen: Uint8Array[] = [];
      await expect(
        (async () => {
          for await (const chunk of storage().readObjectChunks(
            'private/b114',
            1024,
          )) {
            seen.push(chunk);
          }
        })(),
      ).rejects.toThrow('S3 GET object failed with HTTP ' + status);
      expect(seen).toEqual([]);
      expect(cancelled).toBe(1);
      expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
        'GET',
      ]);
    },
  );

  it('B125 preserves the fail-closed GET error when provider stream cancellation rejects', async () => {
    let cancellations = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('partial private payload'));
      },
      cancel() {
        cancellations++;
        return Promise.reject(new Error('provider refused cancellation'));
      },
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(body, { status: 206 }));
    const exposed: Uint8Array[] = [];
    await expect(
      (async () => {
        for await (const chunk of storage().readObjectChunks(
          'exports/private/b125-rejected-provider',
          1024,
        )) {
          exposed.push(chunk);
        }
      })(),
    ).rejects.toThrow('S3 GET object failed with HTTP 206');
    await Promise.resolve();
    expect(cancellations).toBe(1);
    expect(exposed).toEqual([]);
  });

  it('B115 rejects a truncated full GET at natural EOF despite HTTP 200', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('short'));
        controller.close();
      },
    });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { 'content-length': '10' },
      }),
    );
    const seen: Uint8Array[] = [];
    await expect(
      (async () => {
        for await (const chunk of storage().readObjectChunks(
          'b115-truncated',
          1024,
        )) {
          seen.push(chunk);
        }
      })(),
    ).rejects.toThrow('S3 GET object returned a truncated Content-Length body');
    expect(Buffer.concat(seen.map((v) => Buffer.from(v))).toString()).toBe(
      'short',
    );
  });

  it('B115 rejects excess GET bytes before exposing an oversized provider chunk', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(Buffer.from('excess-data'), {
        status: 200,
        headers: { 'content-length': '4' },
      }),
    );
    const seen: Uint8Array[] = [];
    await expect(
      (async () => {
        for await (const chunk of storage().readObjectChunks(
          'b115-excess',
          1024,
        )) {
          seen.push(chunk);
        }
      })(),
    ).rejects.toThrow('S3 GET object exceeded declared Content-Length');
    expect(seen).toEqual([]);
  });

  it('B115 rejects invalid or unsafe full GET Content-Length before reading bytes', async () => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('data'));
      },
      cancel() {
        cancelled++;
      },
    });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { 'content-length': '9007199254740992' },
      }),
    );
    const exposed: Uint8Array[] = [];
    await expect(
      (async () => {
        for await (const chunk of storage().readObjectChunks(
          'b115-invalid',
          1024,
        )) {
          exposed.push(chunk);
        }
      })(),
    ).rejects.toThrow('S3 GET object returned an invalid Content-Length');
    expect(exposed).toEqual([]);
    expect(cancelled).toBe(1);
  });

  it('B115 accepts exact length and streaming without Content-Length', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(Buffer.from('length-8'), {
          status: 200,
          headers: { 'content-length': '8' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('chunked'), {
          status: 200,
        }),
      );
    const results: string[] = [];
    for (const key of ['b115-exact', 'b115-chunked']) {
      const collected: Buffer[] = [];
      for await (const chunk of storage().readObjectChunks(key, 1024)) {
        collected.push(Buffer.from(chunk));
      }
      results.push(Buffer.concat(collected).toString());
    }
    expect(results).toEqual(['length-8', 'chunked']);
  });

  it('B115 early downstream iterator.return remains cancellation, not provider EOF', async () => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('first'));
      },
      cancel() {
        cancelled++;
      },
    });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { 'content-length': '500' },
      }),
    );
    const iterator = storage()
      .readObjectChunks('b115-short-consumer', 1024)
      [Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    await iterator.return?.();
    expect(cancelled).toBe(1);
  });

  it('B114 abort after first chunk throws AbortError rather than reporting clean EOF', async () => {
    let cancelled = 0;
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(Buffer.alloc(2048, 0x61));
      },
      cancel() {
        cancelled++;
      },
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(body, { status: 200 }));
    const iterator = storage()
      .readObjectChunks('private/b114-aborted', 1024, controller.signal)
      [Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.done).toBe(false);
    const firstChunk: unknown = first.value;
    expect(firstChunk).toBeInstanceOf(Uint8Array);
    if (!(firstChunk instanceof Uint8Array)) {
      throw new Error('Expected a real Uint8Array before cancellation');
    }
    expect(firstChunk.byteLength).toBe(1024);
    controller.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(1);
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

    // B114: cancellation is not a successful end of a private file scan.
    await expect(pendingRead).rejects.toMatchObject({ name: 'AbortError' });
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

  it.each([201, 202, 205, 206, 207])(
    'B120 refuses ambiguous HTTP %s on signed DeleteObject',
    async (status) => {
      const spy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(null, { status }));
      await expect(
        storage().deleteObject('exports/private-generation'),
      ).rejects.toThrow('S3 DELETE failed with HTTP ' + status);
      expect(spy).toHaveBeenCalledTimes(1);
    },
  );

  it('B120 confirms compatible HTTP 200 and idempotent 404 without retries', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(
      storage().deleteObject('exports/committed'),
    ).resolves.toBeUndefined();
    await expect(
      storage().deleteObject('exports/absent'),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
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
        new Response(
          '<CompleteMultipartUploadResult><ETag>"complete-etag"</ETag></CompleteMultipartUploadResult>',
          { status: 200 },
        ),
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

  it('B81 never deletes a private export single-PUT object after a lost S3 ACK', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('S3 PUT ACK lost'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/private-generation.json',
      contentType: 'application/json; charset=utf-8',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.from('{"private":true}', 'utf8'));

    // The provider may have durably accepted PUT before the connection
    // dropped. The caller must let the Mongo-backed orphan worker decide
    // whether this exact object is safe to delete.
    await expect(writer.complete()).rejects.toThrow('S3 PUT ACK lost');
    await writer.abort();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PUT',
    ]);
    await expect(writer.complete()).rejects.toThrow('aborted');

    // A separate, explicitly authorized cleanup request can still DELETE.
    await storage().deleteObject('exports/job/private-generation.json');
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PUT',
      'DELETE',
    ]);
  });

  it.each([
    ['"part-one', 'missing closing quote'],
    ['part-one"', 'missing opening quote'],
    ['"part"two"', 'embedded quote'],
    ['"  "', 'whitespace-only ETag'],
    ['"part with space"', 'internal whitespace'],
    ['part\\two', 'backslash'],
    ['x'.repeat(300), 'oversized ETag'],
  ])('B108 rejects invalid UploadPart ETag: %s (%s)', async (rawEtag) => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>b108-private-id</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: rawEtag },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b108-invalid-part.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await expect(
      writer.write(Buffer.alloc(5 * 1024 * 1024, 0x78)),
    ).rejects.toThrow('S3 multipart part returned an invalid ETag');
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
    ]);
    const abortUrl = new URL(fetchSpy.mock.calls[2]?.[0] as string);
    expect(abortUrl.searchParams.get('uploadId')).toBe('b108-private-id');
    expect(abortUrl.searchParams.has('partNumber')).toBe(false);
  });

  it('B108 keeps unquoted opaque provider ETags and XML-escapes their content', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>b108-quoted</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: 'opaque&compatible' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<CompleteMultipartUploadResult><ETag>"complete"</ETag></CompleteMultipartUploadResult>',
          { status: 200 },
        ),
      );
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b108-valid-part.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x79));
    await writer.complete();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'POST',
    ]);
    const xml = Buffer.from(
      fetchSpy.mock.calls[2]?.[1]?.body as Uint8Array,
    ).toString();
    expect(xml).toContain('<ETag>"opaque&amp;compatible"</ETag>');
  });

  it('B106 rejects a chunk beyond the 16 MiB snapshot budget without contacting S3', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b106-oversized.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await expect(
      writer.write(Buffer.alloc(16 * 1024 * 1024 + 1)),
    ).rejects.toThrow('S3 multipart writer pending writes exceed limits');
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('B106 over-budget queued writes cannot complete partial private export', async () => {
    let resolveInitiation!: (response: Response) => void;
    let notifyInitiation!: () => void;
    const initiated = new Promise<void>((resolve) => {
      notifyInitiation = resolve;
    });
    const initiationResponse = new Promise<Response>((resolve) => {
      resolveInitiation = resolve;
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, init) => {
        const parsed = new URL(url as string);
        if (parsed.searchParams.has('uploads')) {
          notifyInitiation();
          return initiationResponse;
        }
        if (init?.method === 'PUT' && parsed.searchParams.has('uploadId')) {
          return new Response(null, {
            status: 200,
            headers: { etag: '"part-one"' },
          });
        }
        if (init?.method === 'DELETE' && parsed.searchParams.has('uploadId')) {
          return new Response(null, { status: 204 });
        }
        throw new Error('B106 did not permit completing a partial generation');
      });
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b106-budget.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    const first = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await initiated;
    const second = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x62));
    const third = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x63));
    const overflow = expect(
      writer.write(Buffer.alloc(5 * 1024 * 1024, 0x64)),
    ).rejects.toThrow('S3 multipart writer pending writes exceed limits');
    const rejectedSecond = expect(second).rejects.toThrow(
      'S3 multipart writer is no longer writable',
    );
    const rejectedThird = expect(third).rejects.toThrow(
      'S3 multipart writer is no longer writable',
    );
    const completion = expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    const aborted = writer.abort();
    resolveInitiation(
      new Response(
        '<InitiateMultipartUploadResult><UploadId>b106-budget</UploadId></InitiateMultipartUploadResult>',
        { status: 200 },
      ),
    );
    await Promise.all([
      first,
      rejectedSecond,
      rejectedThird,
      overflow,
      completion,
      aborted,
    ]);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[2]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('b106-budget');
  });

  it('B106 bounds zero-byte queued calls by number, not only snapshots', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b106-zero.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    const accepted = Array.from({ length: 32 }, () =>
      writer.write(Buffer.alloc(0)),
    );
    const settled = Promise.allSettled(accepted);
    await expect(writer.write(Buffer.alloc(0))).rejects.toThrow(
      'S3 multipart writer pending writes exceed limits',
    );
    await settled;
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('B106 releases snapshot budget after each awaited write', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>b106-released</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-1"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-2"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-3"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-4"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<CompleteMultipartUploadResult><ETag>"ok"</ETag></CompleteMultipartUploadResult>',
          { status: 200 },
        ),
      );
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b106-sequential.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    for (let i = 0; i < 4; i++) {
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x41 + i));
    }
    await writer.complete();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'PUT',
      'PUT',
      'PUT',
      'POST',
    ]);
  });

  it('B105 serializes concurrent multipart writes before completing both signed parts', async () => {
    let acknowledgeFirstPart!: (response: Response) => void;
    const firstPartResponse = new Promise<Response>((resolve) => {
      acknowledgeFirstPart = resolve;
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>private-b105-ordered</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockImplementationOnce(() => firstPartResponse)
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-2"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<CompleteMultipartUploadResult><ETag>"committed"</ETag></CompleteMultipartUploadResult>',
          { status: 200 },
        ),
      );
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b105-ordered.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    const first = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    const second = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x62));
    const completion = writer.complete();
    await expect(writer.write(Buffer.from('late'))).rejects.toThrow(
      'S3 multipart writer is no longer writable',
    );
    acknowledgeFirstPart(
      new Response(null, {
        status: 200,
        headers: { etag: '"part-1"' },
      }),
    );
    await Promise.all([first, second, completion]);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'PUT',
      'POST',
    ]);
    const firstUrl = new URL(fetchSpy.mock.calls[1]?.[0] as string);
    const secondUrl = new URL(fetchSpy.mock.calls[2]?.[0] as string);
    expect(firstUrl.searchParams.get('uploadId')).toBe('private-b105-ordered');
    expect(firstUrl.searchParams.get('partNumber')).toBe('1');
    expect(secondUrl.searchParams.get('partNumber')).toBe('2');
    const body = Buffer.from(
      fetchSpy.mock.calls[3]?.[1]?.body as Uint8Array,
    ).toString();
    expect(body).toContain('<PartNumber>1</PartNumber>');
    expect(body).toContain('<PartNumber>2</PartNumber>');
  });

  it('B105 concurrent abort waits for multipart initiation and cancels the actual uploadId', async () => {
    let acknowledgeInitiation!: (response: Response) => void;
    const initiation = new Promise<Response>((resolve) => {
      acknowledgeInitiation = resolve;
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(() => initiation)
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"first-part"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b105-abort-race.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    const writing = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x63));
    const aborting = writer.abort();
    await expect(writer.write(Buffer.from('late'))).rejects.toThrow(
      'S3 multipart writer is no longer writable',
    );
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer was aborted',
    );
    acknowledgeInitiation(
      new Response(
        '<InitiateMultipartUploadResult><UploadId>private-b105-abort</UploadId></InitiateMultipartUploadResult>',
        { status: 200 },
      ),
    );
    await Promise.all([writing, aborting]);
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[2]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('private-b105-abort');
  });

  it('B105 queues a failed part before complete and still performs private safe abort', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>private-b105-fail</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b105-failure-queue.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    const first = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x64));
    const second = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x65));
    const completion = writer.complete();
    const aborting = writer.abort();
    const failedFirst = expect(first).rejects.toThrow(
      'S3 Upload multipart part failed with HTTP 503',
    );
    const failedSecond = expect(second).rejects.toThrow(
      'S3 multipart writer is no longer writable',
    );
    const failedCompletion = expect(completion).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await Promise.all([failedFirst, failedSecond, failedCompletion, aborting]);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[2]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('private-b105-fail');
  });

  it('B105 snapshots queued mutable byte arrays rather than signing changed content', async () => {
    let acknowledgeFirstPart!: (response: Response) => void;
    const firstPartResponse = new Promise<Response>((resolve) => {
      acknowledgeFirstPart = resolve;
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>private-b105-bytes</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockImplementationOnce(() => firstPartResponse)
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-2"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<CompleteMultipartUploadResult><ETag>"ok"</ETag></CompleteMultipartUploadResult>',
          { status: 200 },
        ),
      );
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b105-bytes.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    const first = writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    const mutable = Buffer.alloc(5 * 1024 * 1024, 0x62);
    const second = writer.write(mutable);
    mutable.fill(0x7a);
    acknowledgeFirstPart(
      new Response(null, {
        status: 200,
        headers: { etag: '"part-1"' },
      }),
    );
    await Promise.all([first, second]);
    await writer.complete();
    const secondPayload = Buffer.from(
      fetchSpy.mock.calls[2]?.[1]?.body as Uint8Array,
    );
    expect(secondPayload[0]).toBe(0x62);
    expect(secondPayload[secondPayload.length - 1]).toBe(0x62);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'PUT',
      'POST',
    ]);
  });

  it('B105 concurrent complete calls on one single PUT never duplicate request', async () => {
    let acknowledgePut!: (response: Response) => void;
    const putResponse = new Promise<Response>((resolve) => {
      acknowledgePut = resolve;
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(() => putResponse);
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b105-single-put.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    const writing = writer.write(Buffer.from('{"one":true}'));
    const a = writer.complete();
    const b = writer.complete();
    acknowledgePut(new Response(null, { status: 200 }));
    await Promise.all([writing, a, b]);
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PUT',
    ]);
  });

  it('B104 failed first multipart PUT forbids later write/complete but allows uploadId abort', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>private-b104-a</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b104-first-part.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await expect(
      writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61)),
    ).rejects.toThrow('S3 Upload multipart part failed with HTTP 503');
    await expect(writer.write(Buffer.from('retry'))).rejects.toThrow(
      'S3 multipart writer is no longer writable',
    );
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[2]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('private-b104-a');
  });

  it('B104 failed later multipart PUT cannot publish only the first successful part', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>private-b104-b</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"good-part-1"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b104-second-part.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await expect(
      writer.write(Buffer.alloc(5 * 1024 * 1024, 0x62)),
    ).rejects.toThrow('S3 Upload multipart part failed with HTTP 503');
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'PUT',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[3]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('private-b104-b');
  });

  it('B104 ambiguous multipart final ACK cannot be resubmitted after failure', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>private-b104-c</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-1"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<CompleteMultipartUploadResult><ETag>&#32;</ETag></CompleteMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b104-completion.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024));
    await expect(writer.complete()).rejects.toThrow(
      'S3 Complete multipart upload failed with HTTP 200',
    );
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'POST',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[3]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('private-b104-c');
  });

  it('B104 ambiguous single PUT ACK forbids unsafe replay of the exact generation', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b104-single.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.from('{"single":true}'));
    await expect(writer.complete()).rejects.toThrow(
      'S3 PUT object failed with HTTP 503',
    );
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart writer cannot complete after a failed operation',
    );
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PUT',
    ]);
  });

  it.each([
    '<CompleteMultipartUploadResult/>',
    '<CompleteMultipartUploadResult />',
    '<CompleteMultipartUploadResult><ETag>&#x20;</ETag></CompleteMultipartUploadResult>',
    '<CompleteMultipartUploadResult><ETag>&#9;</ETag></CompleteMultipartUploadResult>',
  ])(
    'B103 rejects HTTP 200 without a meaningful ETag, aborts only upload ID',
    async (xml) => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            '<InitiateMultipartUploadResult><UploadId>private-b103</UploadId></InitiateMultipartUploadResult>',
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: { etag: '"part-1"' },
          }),
        )
        .mockResolvedValueOnce(new Response(xml, { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      const writer = storage().createMultipartWriter({
        objectKey: 'exports/job/b103-private.json',
        contentType: 'application/json',
        deleteObjectOnAbort: false,
      });
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x74));
      await expect(writer.complete()).rejects.toThrow(
        'S3 Complete multipart upload',
      );
      await writer.abort();
      expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
        'POST',
        'PUT',
        'POST',
        'DELETE',
      ]);
      expect(
        new URL(fetchSpy.mock.calls[3]?.[0] as string).searchParams.get(
          'uploadId',
        ),
      ).toBe('private-b103');
    },
  );

  it.each([
    ['', 'empty'],
    ['<html>OK</html>', 'HTML'],
    ['<Error><Code>InternalError</Code></Error>', 'embedded S3 Error'],
    ['<CompleteMultipartUploadResult>', 'unfinished XML'],
    [
      '<CompleteMultipartUploadResult><ETag>"ok"</Key></CompleteMultipartUploadResult>',
      'B99 mismatched closing field',
    ],
    [
      '<CompleteMultipartUploadResult><Key>k</Key></CompleteMultipartUploadResult>',
      'B99 missing ETag',
    ],
    [
      '<CompleteMultipartUploadResult><ETag>"ok"</ETag><ETag>"dup"</ETag></CompleteMultipartUploadResult>',
      'B99 duplicate ETag',
    ],
    [
      '<CompleteMultipartUploadResult><ETag>&evil;</ETag></CompleteMultipartUploadResult>',
      'B99 unknown XML entity',
    ],
    [
      '<CompleteMultipartUploadResult><ETag><nested/></ETag></CompleteMultipartUploadResult>',
      'B99 nested XML in ETag',
    ],
    [
      '<CompleteMultipartUploadResult><ETag>"ok"</ETag><!-- forged --></CompleteMultipartUploadResult>',
      'B99 injected XML comment',
    ],
  ])(
    'B96 rejects HTTP 200 multipart %s without marking private object committed',
    async (xml) => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            '<InitiateMultipartUploadResult><UploadId>private-b96</UploadId></InitiateMultipartUploadResult>',
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: { etag: '"part-1"' },
          }),
        )
        .mockResolvedValueOnce(new Response(xml, { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      const writer = storage().createMultipartWriter({
        objectKey: 'exports/job/b96-generation.json',
        contentType: 'application/json; charset=utf-8',
        deleteObjectOnAbort: false,
      });

      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
      await expect(writer.complete()).rejects.toThrow(
        'S3 Complete multipart upload',
      );
      // A provider may have committed the object even if its 200 body is
      // invalid; cancelling the uploadId MUST NOT issue an object DELETE.
      await writer.abort();
      expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
        'POST',
        'PUT',
        'POST',
        'DELETE',
      ]);
      const abortUrl = new URL(fetchSpy.mock.calls[3]?.[0] as string);
      expect(abortUrl.searchParams.get('uploadId')).toBe('private-b96');
      expect(abortUrl.searchParams.has('partNumber')).toBe(false);
    },
  );

  it.each([
    ['', 'empty response'],
    ['<html><UploadId>forged</UploadId></html>', 'forged HTML'],
    [
      '<InitiateMultipartUploadResult><UploadId>first</UploadId><UploadId>second</UploadId></InitiateMultipartUploadResult>',
      'duplicate UploadId',
    ],
    ['<Error><UploadId>fake</UploadId></Error>', 'embedded error'],
  ])(
    'B100 refuses unconfirmed multipart initiation %s without signing a part',
    async (xml) => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(xml, { status: 200 }));
      const writer = storage().createMultipartWriter({
        objectKey: 'exports/job/b100-initiation.json',
        contentType: 'application/json',
        deleteObjectOnAbort: false,
      });
      await expect(
        writer.write(Buffer.alloc(5 * 1024 * 1024, 0x70)),
      ).rejects.toThrow('S3 multipart upload id is missing or invalid');
      await writer.abort();
      expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
        'POST',
      ]);
    },
  );

  it('B100 cancels oversized HTTP 200 initiation without buffering or DELETE Object', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.alloc(64 * 1024 + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200 },
    );
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response);
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b100-oversized.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await expect(writer.write(Buffer.alloc(5 * 1024 * 1024))).rejects.toThrow(
      'S3 multipart initiation response exceeds 65536 bytes',
    );
    expect(cancelled).toBe(true);
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
    ]);
  });

  it('B100 decodes a confirmed AWS UploadId before signing part and completion', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
            '<Bucket>losapuntes-files</Bucket><Key>exports/job/b100-valid.json</Key>' +
            '<UploadId>a&amp;b</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 200, headers: { etag: '"p1"' } }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<CompleteMultipartUploadResult><ETag>"ok"</ETag></CompleteMultipartUploadResult>',
          { status: 200 },
        ),
      );
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b100-valid.json',
      contentType: 'application/json',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x70));
    await writer.complete();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'POST',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[1]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('a&b');
  });

  it.each([
    [
      '<CompleteMultipartUploadResult><Bucket>foreign-bucket</Bucket>' +
        '<Key>exports/job/b102-private.json</Key><ETag>"ok"</ETag></CompleteMultipartUploadResult>',
      'foreign bucket',
    ],
    [
      '<CompleteMultipartUploadResult><Bucket>losapuntes-files</Bucket>' +
        '<Key>exports/another-owner/b102.json</Key><ETag>"ok"</ETag></CompleteMultipartUploadResult>',
      'foreign key',
    ],
  ])(
    'B102 rejects multipart completion from %s without deleting private object',
    async (xml) => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            '<InitiateMultipartUploadResult><UploadId>private-b102</UploadId></InitiateMultipartUploadResult>',
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(null, {
            status: 200,
            headers: { etag: '"part-1"' },
          }),
        )
        .mockResolvedValueOnce(new Response(xml, { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      const writer = storage().createMultipartWriter({
        objectKey: 'exports/job/b102-private.json',
        contentType: 'application/json',
        deleteObjectOnAbort: false,
      });
      await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
      await expect(writer.complete()).rejects.toThrow(
        'S3 Complete multipart upload',
      );
      await writer.abort();
      expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
        'POST',
        'PUT',
        'POST',
        'DELETE',
      ]);
      expect(
        new URL(fetchSpy.mock.calls[3]?.[0] as string).searchParams.get(
          'uploadId',
        ),
      ).toBe('private-b102');
    },
  );

  it('B97 caps and cancels an oversized HTTP 200 multipart response without direct object DELETE', async () => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.alloc(64 * 1024 + 1, 0x61));
      },
      cancel() {
        cancelled += 1;
      },
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>private-b97</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-b97"' },
        }),
      )
      .mockResolvedValueOnce(new Response(body, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b97-generation.json',
      contentType: 'application/json; charset=utf-8',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await expect(writer.complete()).rejects.toThrow(
      'S3 multipart completion response exceeds 65536 bytes',
    );
    expect(cancelled).toBe(1);
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'POST',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[3]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('private-b97');
  });

  it('B97 rejects invalid UTF-8 multipart XML and preserves upload-ID-only abort', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>bad-utf8-b97</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"part-b97"' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from([0xc3, 0x28]), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/b97-bad-utf8.json',
      contentType: 'application/json; charset=utf-8',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await expect(writer.complete()).rejects.toThrow();
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'POST',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[3]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('bad-utf8-b97');
  });

  it('B81 aborts only the private multipart upload ID after an ambiguous completion ACK', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>private-upload</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"abcdef0123456789"' },
        }),
      )
      .mockRejectedValueOnce(
        new Error('S3 CompleteMultipartUpload response lost'),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/private-generation.json',
      contentType: 'application/json; charset=utf-8',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await expect(writer.complete()).rejects.toThrow('response lost');
    await writer.abort();

    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'POST',
      'DELETE',
    ]);
    const final = new URL(fetchSpy.mock.calls[3]?.[0] as string);
    expect(final.searchParams.get('uploadId')).toBe('private-upload');
    // There must not be a DELETE request targeting the plain object URL.
    for (const [url, init] of fetchSpy.mock.calls) {
      if (init?.method !== 'DELETE') continue;
      expect(new URL(url as string).searchParams.has('uploadId')).toBe(true);
    }
  });

  it('B81 cancels an unfinished private multipart upload without direct object deletion', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<InitiateMultipartUploadResult><UploadId>cancel-private</UploadId></InitiateMultipartUploadResult>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { etag: '"abcdef0123456789"' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const writer = storage().createMultipartWriter({
      objectKey: 'exports/job/private-generation.json',
      contentType: 'application/json; charset=utf-8',
      deleteObjectOnAbort: false,
    });
    await writer.write(Buffer.alloc(5 * 1024 * 1024, 0x61));
    await writer.abort();
    await writer.abort();
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'PUT',
      'DELETE',
    ]);
    expect(
      new URL(fetchSpy.mock.calls[2]?.[0] as string).searchParams.get(
        'uploadId',
      ),
    ).toBe('cancel-private');
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
