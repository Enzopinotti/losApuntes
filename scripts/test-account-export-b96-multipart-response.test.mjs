import assert from 'node:assert/strict';
import test from 'node:test';

import { isConfirmedS3MultipartCompletion } from '../apps/api/src/files/storage/s3-multipart-completion.ts';

test('B96 accepts a realistic AWS S3 multipart completion XML document', () => {
  assert.equal(isConfirmedS3MultipartCompletion(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    '<Location>https://storage.example/bucket/key</Location>' +
    '<Bucket>bucket</Bucket><Key>key</Key><ETag>"abc"</ETag>' +
    '</CompleteMultipartUploadResult>',
  ), true);
});

test('B96 rejects the known self-closing local S3 completion fixture without an ETag', () => {
  assert.equal(isConfirmedS3MultipartCompletion('<CompleteMultipartUploadResult/>'), false);
  assert.equal(isConfirmedS3MultipartCompletion('<CompleteMultipartUploadResult />'), false);
});

test('B96 rejects blank HTTP 200 bodies instead of claiming S3 completion', () => {
  for (const body of ['', ' ', '\n\r\t']) {
    assert.equal(isConfirmedS3MultipartCompletion(body), false);
  }
});

test('B96 rejects empty-body and HTML/XML unrelated HTTP 200 responses', () => {
  for (const body of [
    '<html><body>OK</body></html>',
    '<Response>completed</Response>',
    '<InitiateMultipartUploadResult />',
    '{"ok":true}', 'OK',
  ]) assert.equal(isConfirmedS3MultipartCompletion(body), false);
});

test('B96 recognizes S3 Error in HTTP 200 even if sibling success exists', () => {
  for (const body of [
    '<Error><Code>InternalError</Code></Error>',
    '<CompleteMultipartUploadResult><Error>failed</Error></CompleteMultipartUploadResult>',
    '<?xml version="1.0"?><Error Code="500" />',
    '<x:Error xmlns:x="urn:s3">fail</x:Error>',
  ]) assert.equal(isConfirmedS3MultipartCompletion(body), false);
});

test('B96 malformed or partial success envelope is not completion', () => {
  for (const body of [
    '<CompleteMultipartUploadResult>',
    '</CompleteMultipartUploadResult>',
    '<CompleteMultipartUploadResult/ ><Error/>',
    '<CompleteMultipartUploadResult/>garbage',
    '<CompleteMultipartUploadResult><Key>key</Key>',
    '<CompleteMultipartUploadResult><CompleteMultipartUploadResult/></CompleteMultipartUploadResult>',
  ]) assert.equal(isConfirmedS3MultipartCompletion(body), false);
});

test('B96 rejects a string beyond the bounded completion response size', () => {
  assert.equal(isConfirmedS3MultipartCompletion('x'.repeat(64 * 1024 + 1)), false);
});

test('B96 accepts a BOM and leading whitespace before valid AWS completion', () => {
  assert.equal(isConfirmedS3MultipartCompletion(
    '\uFEFF \n<?xml version="1.0"?>\n' +
    '<CompleteMultipartUploadResult><ETag>"verified"</ETag></CompleteMultipartUploadResult>',
  ), true);
});

test('B96 errors never become success with invalid input types', () => {
  for (const bad of [undefined, null, false, {}, 1]) {
    assert.equal(isConfirmedS3MultipartCompletion(bad), false);
  }
});

test('B96 provider completion XML must not contain multiple sibling envelopes', () => {
  assert.equal(isConfirmedS3MultipartCompletion(
    '<CompleteMultipartUploadResult/><CompleteMultipartUploadResult/>',
  ), false);
});
