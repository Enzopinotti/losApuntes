import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyViolation,
} from '../password-policy';

function passwordPolicyMessage(value: unknown): string {
  if (typeof value !== 'string') {
    return 'password must be a string';
  }

  const violation = passwordPolicyViolation(value);

  if (violation === 'too_short') {
    return `password must contain at least ${PASSWORD_MIN_LENGTH} Unicode characters`;
  }

  if (violation === 'too_long') {
    return `password must contain at most ${PASSWORD_MAX_LENGTH} Unicode characters`;
  }

  if (violation === 'common_password') {
    return 'password is too common or predictable';
  }

  return 'password does not satisfy the password policy';
}

export function IsPasswordPolicy(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    registerDecorator({
      name: 'isPasswordPolicy',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' && passwordPolicyViolation(value) === null
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return passwordPolicyMessage(args.value);
        },
      },
    });
  };
}
