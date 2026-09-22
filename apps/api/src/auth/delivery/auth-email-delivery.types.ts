export const AUTH_EMAIL_DELIVERY = Symbol('AUTH_EMAIL_DELIVERY');

export type AuthEmailActionMessage = {
  to: string;
  token: string;
  expiresAt: Date;
};

export type AuthEmailSecurityNotice = {
  to: string;
};

export interface AuthEmailDelivery {
  sendEmailVerification(message: AuthEmailActionMessage): Promise<void>;
  sendPasswordRecovery(message: AuthEmailActionMessage): Promise<void>;
  sendPasswordRecoveryCompleted(
    message: AuthEmailSecurityNotice,
  ): Promise<void>;
  sendPasswordChanged(message: AuthEmailSecurityNotice): Promise<void>;
}
