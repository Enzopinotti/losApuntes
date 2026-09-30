import {
  isFilesWorkerHealthCurrent,
  readFilesWorkerHealth,
} from './files-worker-health';

async function main(): Promise<void> {
  try {
    const snapshot = await readFilesWorkerHealth();
    if (!isFilesWorkerHealthCurrent(snapshot)) {
      process.exitCode = 1;
    }
  } catch {
    process.exitCode = 1;
  }
}

void main();
