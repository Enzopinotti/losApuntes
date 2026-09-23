const base = require('./package.json').jest;

module.exports = {
  ...base,
  collectCoverageFrom: [
    'feeds/domain/feed.service.ts',
    'feeds/domain/feed-ranking.ts',
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
