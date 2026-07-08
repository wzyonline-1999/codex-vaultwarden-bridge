import { describe, expect, it } from "vitest";

import { commandConfirmation, isDangerousCommand } from "../src/ssh.js";

describe("ssh safety helpers", () => {
  it("flags common dangerous commands", () => {
    expect(isDangerousCommand("rm -rf /tmp/example")).toBe(true);
    expect(isDangerousCommand("systemctl restart nginx")).toBe(true);
    expect(isDangerousCommand("hostname; uptime")).toBe(false);
  });

  it("builds stable confirmation tokens", () => {
    expect(commandConfirmation("HK VPS", "systemctl restart nginx")).toBe(
      commandConfirmation("HK VPS", "systemctl restart nginx")
    );
    expect(commandConfirmation("HK VPS", "systemctl restart nginx")).toMatch(
      /^run:HK VPS:[a-f0-9]{12}$/
    );
  });
});

