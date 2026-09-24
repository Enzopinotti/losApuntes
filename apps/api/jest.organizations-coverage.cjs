const base = require('./package.json').jest;

module.exports = {
  ...base,
  collectCoverageFrom: [
    'organizations/domain/organization.service.ts',
    'organizations/guards/organizations-verify.guard.ts',
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
