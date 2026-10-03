export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 256;

export const passwordCodePointLength = (password: string): number =>
  Array.from(password.normalize("NFC")).length;

export const newPasswordValidationMessage = (
  password: string,
): true | string => {
  const length = passwordCodePointLength(password);

  if (length < PASSWORD_MIN_LENGTH) {
    return `Usá al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (length > PASSWORD_MAX_LENGTH) {
    return `Usá como máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }

  return true;
};
