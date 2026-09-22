export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 256;

export function passwordCodePointLength(password: string): number {
  return Array.from(password.normalize("NFC")).length;
}

export function newPasswordValidationMessage(password: string): true | string {
  const length = passwordCodePointLength(password);

  if (length < PASSWORD_MIN_LENGTH) {
    return `Usá al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (length > PASSWORD_MAX_LENGTH) {
    return `Usá como máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }

  return true;
}
