const base = require('./package.json').jest;

module.exports = {
  ...base,
  collectCoverageFrom: ['profile/domain/profile.service.ts'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 80,
      functions: 95,
      lines: 90,
    },
  },
};
