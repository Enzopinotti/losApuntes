import {
  RESOURCE_FILE_MIME_TYPES,
  type ResourceFileMimeType,
} from '../domain/file.types';

const SUPPORTED = new Set<string>(RESOURCE_FILE_MIME_TYPES);

function exact(
  bytes: Uint8Array,
  offset: number,
  signature: readonly number[],
): boolean {
  if (bytes.byteLength < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.byteLength < offset + text.length) return false;

  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }

  return true;
}

export function normalizeResourceMimeType(
  mimeType: string,
): ResourceFileMimeType | null {
  const base = mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const normalized = base === 'image/jpg' ? 'image/jpeg' : base;

  return SUPPORTED.has(normalized)
    ? (normalized as ResourceFileMimeType)
    : null;
}

export function verifyResourceMimeType(
  bytes: Uint8Array,
  declaredMimeType: string,
): ResourceFileMimeType | null {
  const declared = normalizeResourceMimeType(declaredMimeType);
  if (!declared) return null;

  if (asciiAt(bytes, 0, '%PDF-')) {
    return declared === 'application/pdf' ? declared : null;
  }

  if (exact(bytes, 0, [0xff, 0xd8, 0xff])) {
    return declared === 'image/jpeg' ? declared : null;
  }

  if (exact(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return declared === 'image/png' ? declared : null;
  }

  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) {
    return declared === 'image/webp' ? declared : null;
  }

  return null;
}
