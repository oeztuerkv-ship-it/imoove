import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

export function generateTemporaryPassword(length = 14): string {
  const size = Math.max(12, Math.min(32, Math.floor(length)));
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
