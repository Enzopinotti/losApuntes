export class AuthEmailDeliveryUnavailableError extends Error {
  constructor() {
    super('Auth email delivery is temporarily unavailable');
    this.name = 'AuthEmailDeliveryUnavailableError';
  }
}
