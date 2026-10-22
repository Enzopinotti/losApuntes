/**
 * S3 CompleteMultipartUpload can return HTTP 200 with an embedded <Error>.
 * A successful HTTP status is insufficient to publish a committed object.
 * B97 bounds the *network* response to 64 KiB; this B99 validator checks
 * its expected shallow S3 XML structure without expanding entities or
 * accepting arbitrary markup. B90 still verifies stored object bytes.
 */
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/u;
const XML_WHITESPACE = /[ \t\r\n]/u;
const ROOT = 'CompleteMultipartUploadResult';
const RESULT_FIELDS = new Set([
  'Location',
  'Bucket',
  'Key',
  'ETag',
  'ChecksumCRC32',
  'ChecksumCRC32C',
  'ChecksumSHA1',
  'ChecksumSHA256',
  'ChecksumCRC64NVME',
  'ChecksumType',
]);

function validXmlText(value: string): boolean {
  // The CDATA end delimiter cannot appear literally in XML text.
  if (value.includes(']]>')) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return false;
    if (code === 0xfffe || code === 0xffff) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return false;
    if (value[i] !== '&') continue;
    const end = value.indexOf(';', i + 1);
    if (end < 0 || end - i > 12) return false;
    const entity = value.slice(i + 1, end);
    if (!['amp', 'lt', 'gt', 'apos', 'quot'].includes(entity)) {
      const isDecimal = /^#[0-9]+$/u.test(entity);
      const isHex = /^#x[0-9a-fA-F]+$/u.test(entity);
      if (!isDecimal && !isHex) return false;
      const point = Number.parseInt(
        entity.slice(isHex ? 2 : 1),
        isHex ? 16 : 10,
      );
      if (
        !Number.isFinite(point) ||
        point > 0x10ffff ||
        (point < 32 && point !== 9 && point !== 10 && point !== 13) ||
        (point >= 0xd800 && point <= 0xdfff) ||
        point === 0xfffe ||
        point === 0xffff
      )
        return false;
    }
    i = end;
  }
  return true;
}

interface XmlTag {
  name: string;
  end: number;
  closing: boolean;
  selfClosing: boolean;
  attributes: string[];
}

function readTag(xml: string, offset: number): XmlTag | null {
  let i = offset + 1;
  const closing = xml[i] === '/';
  if (closing) i += 1;
  const match = XML_NAME.exec(xml.slice(i));
  if (!match) return null;
  const name = match[0];
  i += name.length;
  if (closing) {
    if (xml[i] !== '>') return null;
    return {
      name,
      end: i + 1,
      closing: true,
      selfClosing: false,
      attributes: [],
    };
  }
  const attributes: string[] = [];
  while (i < xml.length) {
    const beforeSpace = i;
    while (XML_WHITESPACE.test(xml[i] ?? '')) i += 1;
    if (xml[i] === '>') {
      return {
        name,
        end: i + 1,
        closing: false,
        selfClosing: false,
        attributes,
      };
    }
    if (xml[i] === '/' && xml[i + 1] === '>') {
      return {
        name,
        end: i + 2,
        closing: false,
        selfClosing: true,
        attributes,
      };
    }
    if (i === beforeSpace) return null;
    const attr = XML_NAME.exec(xml.slice(i));
    if (!attr || attributes.includes(attr[0])) return null;
    i += attr[0].length;
    while (XML_WHITESPACE.test(xml[i] ?? '')) i += 1;
    if (xml[i] !== '=') return null;
    i += 1;
    while (XML_WHITESPACE.test(xml[i] ?? '')) i += 1;
    const quote = xml[i];
    if (quote !== '"' && quote !== "'") return null;
    i += 1;
    const valueStart = i;
    while (i < xml.length && xml[i] !== quote) {
      if (xml[i] === '<') return null;
      i += 1;
    }
    if (i === xml.length || !validXmlText(xml.slice(valueStart, i)))
      return null;
    attributes.push(attr[0]);
    i += 1;
  }
  return null;
}

/**
 * B102 compares the *decoded* S3 result Bucket/Key with the signed request
 * target. validXmlText() has already rejected invalid/nested entities, so
 * this decoder never expands external entities or provider-supplied markup.
 */
function decodeCompletionXmlField(value: string): string {
  return value.replace(
    /&(amp|lt|gt|apos|quot|#[0-9]+|#x[0-9a-fA-F]+);/gu,
    (entity, name: string) => {
      switch (name) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'apos':
          return "'";
        case 'quot':
          return '"';
        default:
          return String.fromCodePoint(
            Number.parseInt(
              name.slice(name.startsWith('#x') ? 2 : 1),
              name.startsWith('#x') ? 16 : 10,
            ),
          );
      }
    },
  );
}

export function isConfirmedS3MultipartCompletion(
  xml: string,
  expected?: { bucket: string; objectKey: string },
): boolean {
  if (typeof xml !== 'string' || xml.length === 0 || xml.length > 64 * 1024) {
    return false;
  }
  const body = xml
    .replace(/^\uFEFF/u, '')
    .trim()
    .replace(/^<\?xml\s+[^<>]*\?>\s*/u, '');
  if (!body) return false;
  // Keep the explicit B96 embedded error boundary, including prefixed errors.
  if (/<(?:[A-Za-z_][\w.-]*:)?Error(?:\s|>|\/)/u.test(body)) return false;

  let index = 0;
  let rootOpen = false;
  let activeField: string | null = null;
  let fieldHasValue = false;
  let fieldText = '';
  let responseBucket: string | null = null;
  let responseKey: string | null = null;
  let etagSeen = false;
  const seenFields = new Set<string>();
  while (index < body.length) {
    if (body[index] !== '<') {
      const next = body.indexOf('<', index);
      const end = next < 0 ? body.length : next;
      const segment = body.slice(index, end);
      if (!validXmlText(segment)) return false;
      if (activeField) {
        fieldText += segment;
        if (segment.trim().length > 0) fieldHasValue = true;
      } else if (segment.trim().length > 0) {
        return false;
      }
      index = end;
      continue;
    }
    const tag = readTag(body, index);
    if (!tag) return false; // No CDATA, comments, DTD, PI or malformed tags.
    index = tag.end;
    if (!rootOpen) {
      if (
        tag.closing ||
        tag.name !== ROOT ||
        tag.attributes.some((name) => name !== 'xmlns')
      )
        return false;
      // Even a well-formed HTTP 200 root without an ETag is not a S3 commit ACK.
      if (tag.selfClosing) return false;
      rootOpen = true;
      continue;
    }
    if (tag.closing && tag.name === ROOT) {
      return (
        activeField === null &&
        etagSeen &&
        index === body.length &&
        (!expected ||
          ((responseBucket === null || responseBucket === expected.bucket) &&
            (responseKey === null || responseKey === expected.objectKey)))
      );
    }
    if (!activeField) {
      if (
        tag.closing ||
        !RESULT_FIELDS.has(tag.name) ||
        tag.selfClosing ||
        tag.attributes.length > 0 ||
        seenFields.has(tag.name)
      )
        return false;
      activeField = tag.name;
      fieldHasValue = false;
      fieldText = '';
      seenFields.add(tag.name);
    } else {
      if (!tag.closing || tag.name !== activeField || !fieldHasValue)
        return false;
      if (activeField === 'ETag') {
        // XML numeric entities can encode whitespace; checking raw text
        // alone would treat &#x20; as a meaningful completion ETag.
        if (decodeCompletionXmlField(fieldText).trim().length === 0) {
          return false;
        }
        etagSeen = true;
      }
      if (activeField === 'Bucket') {
        responseBucket = decodeCompletionXmlField(fieldText);
      }
      if (activeField === 'Key') {
        responseKey = decodeCompletionXmlField(fieldText);
      }
      activeField = null;
    }
  }
  return false;
}
