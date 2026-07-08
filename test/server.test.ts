import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

describe("MCP server", () => {
  it("builds without reading secrets", () => {
    const server = buildServer({
      VAULTWARDEN_BRIDGE_ALLOWED_TAG: "codex:ssh",
      VAULTWARDEN_BRIDGE_REQUIRE_TAG: "true"
    });

    expect(server).toBeTruthy();
  });
});

