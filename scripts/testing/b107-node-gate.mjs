/**
 * Explicit release gate: Node22 is a useful diagnostic, never acceptance.
 * This helper is dependency-free so its policy can be tested on either Node.
 */
export function classifyB107SignedHttpRuntime(nodeMajor, argumentsList) {
  if (!Array.isArray(argumentsList) ||
      argumentsList.some(arg => typeof arg !== 'string')) {
    throw new Error('B107 requires an explicit CLI argument list');
  }
  if (nodeMajor === 24 && argumentsList.length === 0) {
    return 'acceptance';
  }
  if (nodeMajor === 22 && argumentsList.length === 1 &&
      argumentsList[0] === '--diagnostic-node22') {
    return 'diagnostic';
  }
  throw new Error('B107 S3 signed HTTP release acceptance requires Node24; ' +
    'Node22 is diagnostic only with --diagnostic-node22.');
}
