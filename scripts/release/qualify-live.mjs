import {
  ReleaseQualificationError,
  qualifyLiveRelease,
} from './release-qualification-lib.mjs';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ReleaseQualificationError(`MISSING_${name}`);
  }
  return value;
}

function optionalTimeout() {
  const raw = process.env.RELEASE_QUALIFICATION_TIMEOUT_MS?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : Number.NaN;
}

async function main() {
  const evidence = await qualifyLiveRelease({
    webOrigin: required('RELEASE_WEB_ORIGIN'),
    apiOrigin: required('RELEASE_API_ORIGIN'),
    expectedSourceSha: required('RELEASE_EXPECTED_SOURCE_SHA'),
    timeoutMs: optionalTimeout(),
  });

  console.log(
    JSON.stringify({
      event: 'release.qualification.live',
      ...evidence,
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: 'release.qualification.live',
      status: 'HOLD',
      reasonCode:
        error instanceof ReleaseQualificationError
          ? error.code
          : 'UNEXPECTED_ERROR',
    }),
  );
  process.exitCode = 2;
});
