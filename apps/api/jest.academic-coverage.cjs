const base = require('./package.json').jest;

module.exports = {
  ...base,
  collectCoverageFrom: [
    'academic/domain/academic.service.ts',
    'academic/guards/academic-admin.guard.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 75,
      functions: 90,
      lines: 85,
    },
  },
};
