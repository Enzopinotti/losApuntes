import type { FastifyRequest } from 'fastify';

import type {
  AuthClientType,
  PublicAuthSession,
} from './session/auth-session.types';

export type AuthenticatedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
};

export type OptionallyAuthenticatedRequest = FastifyRequest & {
  user?: AuthenticatedUser;
};

export type AuthenticatedRequest = FastifyRequest & {
  user: AuthenticatedUser;
  authSession: PublicAuthSession;
  authTransport: AuthClientType;
  authCredentialVersion: number;
};
