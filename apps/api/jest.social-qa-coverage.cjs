const base = require('./package.json').jest;

module.exports = {
  ...base,
  collectCoverageFrom: [
    'social/domain/social.service.ts',
    'qa/domain/qa.service.ts',
    'notifications/domain/notification.service.ts',
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
