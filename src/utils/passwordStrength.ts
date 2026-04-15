export type PasswordStrengthLevel = "weak" | "medium" | "strong";

export interface PasswordStrengthResult {
  level: PasswordStrengthLevel;
  score: number;
  checks: {
    minLength: boolean;
    hasLower: boolean;
    hasUpper: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

const SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= 8,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: SPECIAL.test(password),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  let level: PasswordStrengthLevel = "weak";
  if (passed >= 5 && password.length >= 10) level = "strong";
  else if (passed >= 3) level = "medium";

  return { level, score: passed, checks };
}

export function meetsMinimumPassword(password: string): boolean {
  const { level } = evaluatePasswordStrength(password);
  return level !== "weak";
}
