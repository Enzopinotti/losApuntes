const { jest: baseJest } = require('./package.json');

module.exports = {
  ...baseJest,
  collectCoverageFrom: [
    'auth/auth.service.ts',
    'auth/abuse/auth-abuse.service.ts',
    'auth/abuse/mongo-auth-abuse.store.ts',
    'auth/account-security.service.ts',
    'auth/password.service.ts',
    'auth/password-policy.ts',
    'auth/action-token/auth-action-token.service.ts',
    'auth/session/auth-session.service.ts',
    'auth/session/session-credential.ts',
    'auth/session/session-cookie.ts',
    'auth/session/session-token.ts',
    'auth/guards/auth-session.guard.ts',
    'auth/guards/optional-auth-session.guard.ts',
    'auth/guards/csrf-origin.guard.ts',
    'auth/lifecycle/auth-lifecycle.service.ts',
    'auth/google/google-auth.service.ts',
    'auth/google/google-oauth-attempt.service.ts',
    'auth/google/google-proof.ts',
  ],
  coverageDirectory: '../coverage/auth-critical',
  coverageReporters: ['text', 'text-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 80,
      functions: 95,
      lines: 90,
    },
  },
};
