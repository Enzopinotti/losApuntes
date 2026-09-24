const base = require('./package.json').jest;

module.exports = {
  ...base,
  collectCoverageFrom: [
    'academic/domain/academic-lifecycle.service.ts',
    'academic/domain/academic-lifecycle.helpers.ts',
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
