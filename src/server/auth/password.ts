import bcrypt from "bcryptjs";

const COST = process.env.NODE_ENV === "test" ? 4 : 12;

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, COST);
}
export function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}
/** Minimum policy: 10+ chars, at least one letter and one number. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Include at least one letter and one number.";
  return null;
}
