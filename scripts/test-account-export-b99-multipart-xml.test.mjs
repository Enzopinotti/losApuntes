import assert from 'node:assert/strict';
import test from 'node:test';
import { isConfirmedS3MultipartCompletion as valid } from '../apps/api/src/files/storage/s3-multipart-completion.ts';

const wrap = fields =>
  '<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
  fields +
  '</CompleteMultipartUploadResult>';
const good = '<Location>https://s3.example/a&amp;b</Location><Bucket>bucket</Bucket><Key>name</Key><ETag>"etag"</ETag>';

test('B99 accepts AWS envelope and checksums but rejects legacy empty ACK', () => {
  assert.equal(valid('<?xml version="1.0" encoding="UTF-8"?>' + wrap(good)), true);
  assert.equal(valid(wrap('<ETag>"v"</ETag><ChecksumCRC64NVME>abc=</ChecksumCRC64NVME>')), true);
  assert.equal(valid(wrap('<ETag>&quot;v&amp;2&quot;</ETag><Key>áñ€</Key>')), true);
  assert.equal(valid('<CompleteMultipartUploadResult/>'), false);
  assert.equal(valid('\uFEFF \n<?xml version="1.0"?>\n<CompleteMultipartUploadResult />'), false);
});

test('B99 rejects unclosed, mismatched, duplicate or nested provider fields', () => {
  for (const s of [
    '<ETag>"v"</Key>',
    '<ETag>"v"',
    '<Key>name</Key><ETag>"v"</ETag></Key>',
    '<ETag>"v"</ETag><ETag>"dup"</ETag>',
    '<ETag><Value>"v"</Value></ETag>',
    '<ETag></ETag>', '<ETag/>',
    '<Key>name</Key>',
    '<ETag>"v"</ETag><Unknown>extra</Unknown>',
    '<ETag>"v"</ETag><x:Error>oops</x:Error>',
  ]) assert.equal(valid(wrap(s)), false, s);
});

test('B99 rejects malformed namespaces, attributes, declarations or injected markup', () => {
  for (const s of [
    '<CompleteMultipartUploadResult xmlns=http://s3.example><ETag>"v"</ETag></CompleteMultipartUploadResult>',
    '<CompleteMultipartUploadResult xmlns="x" xmlns="y"><ETag>"v"</ETag></CompleteMultipartUploadResult>',
    '<CompleteMultipartUploadResult data-x="1"><ETag>"v"</ETag></CompleteMultipartUploadResult>',
    wrap('<ETag custom="x">"v"</ETag>'),
    wrap('<ETag>"v"</ETag><!-- forged -->'),
    '<!DOCTYPE a [<!ENTITY x "v">]>' + wrap(good),
    wrap('<ETag><![CDATA["v"]]></ETag>'),
    wrap('<ETag>"v"</ETag><?pi x?>'),
    wrap('<ETag>"v"</ETag>') + '<Error/>',
    '<CompleteMultipartUploadResult><ETag>"v"</ETag></CompleteMultipartUploadResult/ >',
  ]) assert.equal(valid(s), false, s);
});

test('B99 rejects undefined named, unescaped and malformed numeric XML entities', () => {
  for (const s of [
    '<ETag>&notDefined;</ETag>', '<ETag>&amp</ETag>',
    '<ETag>"x&y"</ETag>', '<ETag>&#0;</ETag>',
    '<ETag>&#xD800;</ETag>', '<ETag>&#x110000;</ETag>',
    '<ETag>"v"</ETag><Location>https://x/a?x=1&y=2</Location>',
  ]) assert.equal(valid(wrap(s)), false, s);
});

test('B99 accepts valid numeric entities and rejects embedded controls', () => {
  assert.equal(valid(wrap('<ETag>&#34;x&#x22;</ETag>')), true);
  assert.equal(valid(wrap('<ETag>ok\u0001</ETag>')), false);
  assert.equal(valid(wrap('<ETag>\ud800</ETag>')), false);
  assert.equal(valid(wrap('<ETag>\ufffe</ETag>')), false);
  assert.equal(valid(wrap('<ETag>bad]]>text</ETag>')), false);
});
