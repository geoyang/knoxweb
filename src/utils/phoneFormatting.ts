/**
 * Shared phone formatting utilities for country-code-aware input.
 */

const isNANP = (dialCode: string) => dialCode === '+1';

/**
 * Format a phone string for display in the input field.
 * - Strips non-digits
 * - For +1 (NANP) countries: strips leading "1" if > 10 digits, formats as (XXX) XXX-XXXX
 * - For non-+1 countries: returns raw digits only
 * - Pass `prev` (the previous formatted value) so that backspacing through
 *   a formatting character (e.g. ")" or "-") correctly removes a digit
 *   instead of snapping back to the same formatted string.
 */
export function formatPhoneForInput(raw: string, dialCode: string, prev?: string): string {
  let digits = raw.replace(/\D/g, '');

  if (isNANP(dialCode)) {
    // Strip leading "1" — the country code already provides it
    if (digits.length > 10 && digits.startsWith('1')) {
      digits = digits.slice(1);
    }

    // Detect deletion of a formatting character: digit count unchanged but
    // the string got shorter → drop the trailing digit so the user sees progress.
    if (prev !== undefined) {
      const prevDigits = prev.replace(/\D/g, '');
      if (digits.length > 0 && digits.length === prevDigits.length && raw.length < prev.length) {
        digits = digits.slice(0, -1);
      }
    }

    // Cap at 10 digits
    digits = digits.slice(0, 10);

    if (digits.length >= 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    } else if (digits.length >= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length >= 3) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return digits;
  }

  // Non-US: just return digits, capped at 15
  return digits.slice(0, 15);
}

/**
 * Extract clean digits for API submission (E.164 without the +dialCode prefix).
 * - Strips all formatting
 * - For +1 countries: strips leading "1" to avoid duplication
 */
export function extractDigits(formatted: string, dialCode: string): string {
  let digits = formatted.replace(/\D/g, '');

  if (isNANP(dialCode) && digits.startsWith('1') && digits.length > 10) {
    digits = digits.slice(1);
  }

  return digits;
}
