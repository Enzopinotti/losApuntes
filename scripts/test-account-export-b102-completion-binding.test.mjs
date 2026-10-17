import assert from 'node:assert/strict';
import test from 'node:test';

import { isConfirmedS3MultipartCompletion as confirm } from
  '../apps/api/src/files/storage/s3-multipart-completion.ts';

const expected = {
  bucket: 'export-private',
  objectKey: 'exports/owner-1/a&b final.json',
};
const wrap = (bucket, key) =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
  (bucket === null ? '' : '<Bucket>' + bucket + '</Bucket>') +
  (key === null ? '' : '<Key>' + key + '</Key>') +
  '<ETag>"committed"</ETag>' +
  '</CompleteMultipartUploadResult>';

test('B102 confirms matching S3 completion Bucket/Key for the requested private generation', () => {
  assert.equal(confirm(wrap('export-private', 'exports/owner-1/a&amp;b final.json'), expected), true);
  assert.equal(confirm(wrap('export-private', 'exports/owner-1/a&#38;b final.json'), expected), true);
  assert.equal(confirm(wrap('export-private', 'exports/owner-1/a&#x26;b final.json'), expected), true);
});

test('B102 fails closed if S3 HTTP 200 completion reports another bucket or owner object key', () => {
  for (const xml of [
    wrap('other-bucket', 'exports/owner-1/a&amp;b final.json'),
    wrap('export-private', 'exports/owner-2/a&amp;b final.json'),
    wrap('export-private', 'exports/owner-1/a&amp;b final.json.bak'),
    wrap('export-private', 'exports/owner-1/a&amp;amp;b final.json'),
    wrap('export-private', 'exports/owner-1/a&#x2F;b final.json'),
  ]) assert.equal(confirm(xml, expected), false, xml);
});

test('B102 treats field omission as provider-compatible but never trusts an explicit mismatch', () => {
  assert.equal(confirm(wrap(null, null), expected), true);
  assert.equal(confirm(wrap('export-private', null), expected), true);
  assert.equal(confirm(wrap(null, 'exports/owner-1/a&amp;b final.json'), expected), true);
  assert.equal(confirm(wrap(null, 'wrong'), expected), false);
});

test('B102 rejects B86 legacy empty ACK and preserves B99 syntax guards', () => {
  assert.equal(confirm('<CompleteMultipartUploadResult/>', expected), false);
  assert.equal(confirm(wrap('other-bucket', 'other'), undefined), true,
    'legacy XML-only parsing remains independent for diagnostics');
  assert.equal(confirm(wrap('export-private', 'exports/owner-1/a&b final.json'), expected), false);
  assert.equal(confirm(wrap('export-private', 'exports/owner-1/a&amp;b final.json')
    .replace('<ETag>"committed"</ETag>', '<ETag>"x"</Key>'), expected), false);
});

test('B102 forbids duplicate Bucket/Key and Error even when the first target matches', () => {
  const valid = wrap('export-private', 'exports/owner-1/a&amp;b final.json');
  assert.equal(confirm(valid.replace('<ETag>',
    '<Bucket>other-bucket</Bucket><ETag>'), expected), false);
  assert.equal(confirm(valid.replace('<ETag>',
    '<Key>exports/other.json</Key><ETag>'), expected), false);
  assert.equal(confirm(valid.replace('<ETag>',
    '<Error>failed</Error><ETag>'), expected), false);
});
