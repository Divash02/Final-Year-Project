import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_LABELS,
  PASSWORD_REQUIREMENTS,
  scorePasswordStrength,
  validatePassword,
} from "./passwordPolicy";

describe("validatePassword (live UI feedback, mirrors backend)", () => {
  it("rejects every requirement when the password is tiny", () => {
    const result = validatePassword("abc");
    assert.equal(result.valid, false);
    assert.deepEqual(
      result.errors.map((e) => e.message).sort(),
      [
        `Must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
        "At least one uppercase letter (A-Z).",
        "At least one number (0-9).",
        "At least one special character.",
      ].sort(),
    );
    // Errors mirror the backend shape exactly.
    result.errors.forEach((e) => {
      assert.equal(e.field, "newPassword");
      assert.equal(typeof e.message, "string");
    });
  });

  it("passes a fully compliant password", () => {
    const result = validatePassword("Abcd1234!");
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("fails when missing an uppercase letter", () => {
    const result = validatePassword("abcdefg1!");
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.message === "At least one uppercase letter (A-Z)."),
    );
  });

  it("fails when missing a lowercase letter", () => {
    const result = validatePassword("ABCDEFG1!");
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.message === "At least one lowercase letter (a-z)."),
    );
  });

  it("fails when missing a digit", () => {
    const result = validatePassword("Abcdefgh!");
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.message === "At least one number (0-9)."));
  });

  it("fails when missing a special character", () => {
    const result = validatePassword("Abcdefgh1");
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.message === "At least one special character."),
    );
  });

  it("respects a custom minimum length", () => {
    const result = validatePassword("Abc1!", { minimumLength: 8 });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) =>
        e.message.startsWith(`Must be at least 8 characters`),
      ),
    );
  });

  it("rejects passwords exceeding the bcrypt byte limit", () => {
    const long = "Aa1!" + "a".repeat(PASSWORD_MAX_BYTES + 1);
    const result = validatePassword(long);
    assert.ok(
      result.errors.some((e) =>
        e.message.includes(`Must not exceed ${PASSWORD_MAX_BYTES} UTF-8 bytes.`),
      ),
    );
    assert.equal(result.valid, false);
  });

  it("treats non-string input as invalid without throwing", () => {
    const result = validatePassword(undefined as unknown as string);
    assert.equal(result.valid, false);
  });
});

describe("PASSWORD_REQUIREMENTS", () => {
  it("exposes one check per rule", () => {
    assert.equal(PASSWORD_REQUIREMENTS.length, 5);
    assert.deepEqual(
      PASSWORD_REQUIREMENTS.map((r) => r.id),
      ["length", "upper", "lower", "digit", "special"],
    );
  });

  it("each requirement's test agrees with validatePassword", () => {
    const value = "Abcd1234!";
    PASSWORD_REQUIREMENTS.forEach((req) => {
      assert.equal(req.test(value), true);
    });
    assert.equal(validatePassword(value).valid, true);
  });
});

describe("scorePasswordStrength", () => {
  it("rates an empty password as very weak", () => {
    const { strength, score } = scorePasswordStrength("");
    assert.equal(strength, "very-weak");
    assert.equal(score, 0);
  });

  it("rates 'Password1!' as fair (common-word penalty), not strong", () => {
    const { strength } = scorePasswordStrength("Password1!");
    assert.equal(strength, "fair");
  });

  it("rates a long, varied password with no patterns as strong", () => {
    const { strength } = scorePasswordStrength("Vx8#qW3$znLp2@kT");
    assert.equal(strength, "strong");
  });

  it("demotes sequential runs", () => {
    const { strength } = scorePasswordStrength("Abcd1234!"); // abc + 123
    assert.equal(strength, "fair");
  });

  it("labels always come from the canonical table", () => {
    assert.equal(
      scorePasswordStrength("Aa1!Aa1!Aa1!Aa1!Aa1!").label,
      PASSWORD_STRENGTH_LABELS.strong,
    );
  });
});
