const base = require('./package.json').jest;

module.exports = {
  ...base,
  collectCoverageFrom: [
    'files/domain/file.service.ts',
    'files/storage/file-mime.ts',
    'files/storage/s3-object-storage.ts',
    'resources/domain/resource.service.ts',
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
