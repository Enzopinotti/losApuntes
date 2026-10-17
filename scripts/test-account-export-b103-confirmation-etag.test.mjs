import assert from 'node:assert/strict';
import test from 'node:test';
import { isConfirmedS3MultipartCompletion as confirmed } from
  '../apps/api/src/files/storage/s3-multipart-completion.ts';

const root = children =>
  '<CompleteMultipartUploadResult>' + children + '</CompleteMultipartUploadResult>';

test('B103 a selfclosing HTTP 200 result never confirms multipart completion', () => {
  for (const xml of [
    '<CompleteMultipartUploadResult/>',
    '<CompleteMultipartUploadResult />',
    '<?xml version="1.0"?><CompleteMultipartUploadResult/>',
    '\uFEFF \n<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>',
  ]) {
    assert.equal(confirmed(xml), false, xml);
    assert.equal(confirmed(xml, { bucket: 'exports', objectKey: 'owner/a.json' }), false, xml);
  }
});

test('B103 decoded XML whitespace cannot masquerade as a nonempty ETag', () => {
  for (const value of [
    '&#32;', '&#x20;', '&#9;', '&#xA;', '&#13;',
    '&#32;&#x9;&#10;', ' &#x20; ', '\n&#x20;\r',
  ]) {
    assert.equal(confirmed(root('<ETag>' + value + '</ETag>')), false, value);
  }
});

test('B103 a real ETag confirms the completion envelope without weakening B102 binding', () => {
  const destination = { bucket: 'my-bucket', objectKey: 'exports/owner/gen.json' };
  const success = root(
    '<Bucket>my-bucket</Bucket><Key>exports/owner/gen.json</Key><ETag>"actual-etag"</ETag>',
  );
  assert.equal(confirmed(success, destination), true);
  assert.equal(confirmed(success, { ...destination, objectKey: 'exports/other/gen.json' }), false);
  assert.equal(confirmed(root('<ETag>&quot;actual-etag&quot;</ETag>'), destination), true);
});

test('B103 malformed XML, missing ETag and S3 Error remain unsafe', () => {
  for (const xml of [
    '', root('<Bucket>b</Bucket>'), root('<ETag></ETag>'), root('<ETag/>'),
    root('<ETag> </ETag>'), root('<ETag>"v"</ETag><ETag>"x"</ETag>'),
    '<Error><Code>InternalError</Code></Error>',
  ]) assert.equal(confirmed(xml), false, xml);
});

test('B103 raw 64KiB limit and historical B99 entities remain enforced', () => {
  assert.equal(confirmed(root('<ETag>"v"</ETag>') + 'a'.repeat(64 * 1024)), false);
  assert.equal(confirmed(root('<ETag>&#34;v&#x22;</ETag>')), true);
  assert.equal(confirmed(root('<ETag>&unknown;</ETag>')), false);
});
