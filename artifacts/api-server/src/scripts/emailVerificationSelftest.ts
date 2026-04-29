import assert from "node:assert";
import {
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  generateSixDigitCode,
  hashEmailVerificationCode,
  normalizeCustomerEmail,
} from "../lib/emailVerificationCode";

process.env.EMAIL_VERIFICATION_CODE_PEPPER = "email-ver-selftest-pepper-32chars-xx";

function main(): void {
  assert.strictEqual(normalizeCustomerEmail("  A@b.C "), "a@b.c");
  assert.strictEqual(normalizeCustomerEmail(""), "");
  assert.match(generateSixDigitCode(), /^[0-9]{6}$/);
  assert.strictEqual(EMAIL_VERIFICATION_MAX_ATTEMPTS, 5);
  assert.strictEqual(
    hashEmailVerificationCode("x@y.z", "100200"),
    hashEmailVerificationCode("x@y.z", "100200"),
  );
  assert.notStrictEqual(
    hashEmailVerificationCode("x@y.z", "100201"),
    hashEmailVerificationCode("x@y.z", "100200"),
  );
}

main();
console.info("emailVerificationSelftest: OK");

