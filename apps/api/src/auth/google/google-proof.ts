import type { GoogleIdentityProof } from './google.types';

export function normalizeGoogleEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isGoogleAuthoritativeMailbox(
  proof: GoogleIdentityProof,
): boolean {
  if (!proof.emailVerified) {
    return false;
  }

  const email = normalizeGoogleEmail(proof.email);

  return email.endsWith('@gmail.com') || Boolean(proof.hostedDomain);
}

export function validGoogleProof(proof: GoogleIdentityProof): boolean {
  return (
    proof.subject.trim().length > 0 &&
    normalizeGoogleEmail(proof.email).length > 0 &&
    proof.emailVerified
  );
}
