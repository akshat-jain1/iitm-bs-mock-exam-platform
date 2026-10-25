/**
 * Centralized Authentication & Domain Configuration
 * 
 * Scaler Student Examination Platform
 * Official Domain: sst.scaler.com
 */

export const ALLOWED_EMAIL_DOMAIN = "sst.scaler.com";

export interface EmailValidationResult {
  allowed: boolean;
  reason?: string;
  normalizedEmail?: string;
}

/**
 * Validates whether an email address belongs to the official Scaler student domain.
 * 
 * Rules:
 * 1. Must be a non-empty string.
 * 2. Must be verified by the OAuth provider.
 * 3. Normalized to lowercase and whitespace trimmed.
 * 4. Must exactly match the allowed domain (@sst.scaler.com).
 * 5. Rejects personal Gmail, Outlook, other institutions, and lookalike domains.
 */
export function validateScalerEmail(
  email: string | null | undefined,
  isEmailVerified: boolean = true
): EmailValidationResult {
  if (!email || typeof email !== "string" || email.trim().length === 0) {
    return {
      allowed: false,
      reason: "Email address is required.",
    };
  }

  if (!isEmailVerified) {
    return {
      allowed: false,
      reason: "Email address must be verified by the authentication provider.",
    };
  }

  const normalized = email.trim().toLowerCase();

  // Basic RFC email format check (local-part@domain)
  const parts = normalized.split("@");
  if (parts.length !== 2) {
    return {
      allowed: false,
      reason: "Invalid email address format.",
    };
  }

  const [localPart, domainPart] = parts;

  if (!localPart || localPart.length === 0 || !domainPart || domainPart.length === 0) {
    return {
      allowed: false,
      reason: "Invalid email address format.",
    };
  }

  // Exact domain check — no substring or prefix/suffix matching
  // Prevents lookalikes like: fake-sst.scaler.com, sst.scaler.com.evil.com, etc.
  if (domainPart !== ALLOWED_EMAIL_DOMAIN.toLowerCase()) {
    return {
      allowed: false,
      reason: "Access restricted. Please sign in using your official Scaler email account.",
    };
  }

  return {
    allowed: true,
    normalizedEmail: normalized,
  };
}

/**
 * Simple boolean helper to check if an email is an allowed Scaler student email.
 */
export function isAllowedScalerEmail(email: string | null | undefined): boolean {
  return validateScalerEmail(email, true).allowed;
}
