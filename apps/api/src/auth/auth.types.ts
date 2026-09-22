export type JwtPayload = {
  sub: string;
  role: string;
};

export type AuthenticatedUser = {
  userId: string;
  role: string;
};

export type AuthenticatedRequest = {
  user: AuthenticatedUser;
};
