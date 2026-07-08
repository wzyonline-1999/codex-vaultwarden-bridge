import { describe, expect, it } from "vitest";

import { buildBwInstallHint } from "../src/install.js";

describe("Bitwarden CLI install hints", () => {
  it("returns installed guidance when bw is already available", () => {
    const hint = buildBwInstallHint("darwin", "arm64", {
      bw: true,
      brew: true,
      npm: true
    });

    expect(hint.installed).toBe(true);
    expect(hint.recommended.command).toBe("bw --version");
  });

  it("prefers Homebrew on macOS when bw is missing", () => {
    const hint = buildBwInstallHint("darwin", "arm64", {
      bw: false,
      brew: true,
      npm: true
    });

    expect(hint.installed).toBe(false);
    expect(hint.recommended).toMatchObject({
      manager: "homebrew",
      command: "brew install bitwarden-cli"
    });
    expect(hint.alternatives.some((item) => item.manager === "npm")).toBe(true);
  });

  it("prefers winget on Windows", () => {
    const hint = buildBwInstallHint("win32", "x64", {
      bw: false,
      winget: true,
      choco: true,
      npm: true
    });

    expect(hint.recommended.command).toBe("winget install Bitwarden.CLI");
    expect(hint.alternatives.map((item) => item.manager)).toContain("chocolatey");
  });

  it("falls back to npm on Linux when available", () => {
    const hint = buildBwInstallHint("linux", "x64", {
      bw: false,
      npm: true
    });

    expect(hint.recommended.command).toBe("npm install -g @bitwarden/cli");
  });
});

