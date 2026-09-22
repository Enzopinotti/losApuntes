import type { Request } from 'express';

export type JwtPayload = {
  sub: string;
  role: string;
};

export type AuthenticatedUser = {
  userId: string;
  role: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
