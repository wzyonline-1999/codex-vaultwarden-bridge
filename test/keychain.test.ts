import { describe, expect, it } from "vitest";

import {
  isKeychainSecretName,
  isKeychainSupported,
  isMissingKeychainItem,
  keychainService
} from "../src/keychain.js";

describe("keychain helpers", () => {
  it("uses a stable default service name", () => {
    expect(keychainService({})).toBe("codex-vaultwarden-bridge");
    expect(keychainService({ VAULTWARDEN_BRIDGE_KEYCHAIN_SERVICE: "custom-service" })).toBe(
      "custom-service"
    );
  });

  it("limits secret names to Bitwarden CLI values", () => {
    expect(isKeychainSecretName("BW_CLIENTID")).toBe(true);
    expect(isKeychainSecretName("BW_CLIENTSECRET")).toBe(true);
    expect(isKeychainSecretName("OPENAI_API_KEY")).toBe(false);
  });

  it("only treats macOS as a Keychain host", () => {
    expect(isKeychainSupported("darwin")).toBe(true);
    expect(isKeychainSupported("linux")).toBe(false);
    expect(isKeychainSupported("win32")).toBe(false);
  });

  it("recognizes missing Keychain item errors", () => {
    expect(
      isMissingKeychainItem({
        exitCode: 44,
        stdout: "",
        stderr: "security: SecKeychainSearchCopyNext: The specified item could not be found."
      })
    ).toBe(true);
    expect(
      isMissingKeychainItem({
        exitCode: 1,
        stdout: "",
        stderr: "security: user interaction is not allowed"
      })
    ).toBe(false);
  });
});
