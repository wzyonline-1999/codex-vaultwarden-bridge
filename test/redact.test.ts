import { describe, expect, it } from "vitest";

import { redact, redactObject } from "../src/redact.js";

describe("redaction", () => {
  it("redacts private key blocks", () => {
    const text = "x\n-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\ny";
    expect(redact(text)).toBe("x\n[REDACTED_PRIVATE_KEY]\ny");
  });

  it("redacts sensitive object fields", () => {
    expect(
      redactObject({
        name: "item",
        privateKey: "secret",
        session: "secret",
        clientId: "secret",
        nested: { token: "secret" }
      })
    ).toEqual({
      name: "item",
      privateKey: "[REDACTED]",
      session: "[REDACTED]",
      clientId: "[REDACTED]",
      nested: { token: "[REDACTED]" }
    });
  });
});
