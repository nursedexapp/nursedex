/**
 * Auto-formats a US phone number from raw input as the user types.
 * "5161234567" -> "(516) 123-4567". Strips non-digits, keeps the
 * first 10 digits, and inserts the parens, space, and dash.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  const len = digits.length;
  if (len === 0) return "";
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Validates a US phone number. Returns null if valid, or a user-facing
 * error message if not. Empty / null / undefined is considered valid
 * (the field is optional at the call site, where a refine combines
 * email + phone "at least one" logic).
 *
 * Rules:
 * - Must be exactly 10 digits once stripped.
 * - Middle three digits ("the prefix") cannot be 555, that's
 *   reserved for fictional numbers.
 * - Cannot be a single digit repeated (5555555555, 0000000000).
 * - Cannot be sequential ascending or descending across the full
 *   10 digits (1234567890, 9876543210), or across the last 7 digits
 *   (5161234567, 5169876543).
 */
export function validatePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length !== 10) {
    return "Please enter a complete 10-digit phone number";
  }

  const prefix = digits.slice(3, 6);
  if (prefix === "555") {
    return "555 phone numbers are reserved for movies. Use your real number.";
  }

  if (isAllSameDigit(digits)) {
    return "Please enter a real phone number";
  }

  if (isSequential(digits) || isSequential(digits.slice(3))) {
    return "Please enter a real phone number";
  }

  return null;
}

function isAllSameDigit(digits: string): boolean {
  return /^(\d)\1+$/.test(digits);
}

/**
 * True if the digit string is a strictly ascending or descending
 * consecutive sequence (e.g., "1234567" or "7654321"). 0 wraps:
 * "0123456789" counts; "9876543210" counts.
 */
function isSequential(digits: string): boolean {
  if (digits.length < 2) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    const prev = parseInt(digits[i - 1], 10);
    const curr = parseInt(digits[i], 10);
    if (curr !== prev + 1) ascending = false;
    if (curr !== prev - 1) descending = false;
  }
  return ascending || descending;
}
