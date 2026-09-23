const base = require('./package.json').jest;

module.exports = {
  ...base,
  collectCoverageFrom: [
    'pilot/domain/pilot.service.ts',
    'pilot/telemetry/pilot-event.service.ts',
    'pilot/guards/pilot-ops-read.guard.ts',
    'pilot/guards/moderation-write.guard.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 80,
      functions: 95,
      lines: 90,
    },
  },
};
