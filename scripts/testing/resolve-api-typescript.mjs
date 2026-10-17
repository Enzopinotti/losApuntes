import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * B101 local-test-only Node ESM resolver. The production Nest imports remain
 * extensionless; Node --experimental-strip-types does not add ".ts" to them.
 *
 * Only relative specifiers originating inside apps/api/src may be completed,
 * and only if the target remains in the same source tree and exists.
 * Bare packages, node: imports, URLs, query strings, and external paths are
 * handled by the standard Node resolver unchanged.
 */
const apiSourceRoot = new URL('../../apps/api/src/', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL;
  if (
    typeof parent !== 'string' ||
    !parent.startsWith(apiSourceRoot.href) ||
    !specifier.startsWith('.') ||
    /[?#]/u.test(specifier) ||
    /\.[^/]+$/u.test(specifier)
  ) {
    return nextResolve(specifier, context);
  }
  const candidate = new URL(specifier + '.ts', parent);
  if (!candidate.href.startsWith(apiSourceRoot.href)) {
    return nextResolve(specifier, context);
  }
  try {
    await access(fileURLToPath(candidate));
  } catch {
    return nextResolve(specifier, context);
  }
  return nextResolve(candidate.href, context);
}
