import { describe, expect, it } from "vitest";

import { extractSshTarget, isAllowedItem, summarizeItem } from "../src/vault.js";

const policy = { allowedTag: "codex:ssh", requireTag: true };

describe("vault item helpers", () => {
  it("summarizes items without returning secret values", () => {
    const item = {
      id: "item-1",
      name: "HK VPS",
      notes: "codex:ssh",
      login: {
        username: "root",
        password: "never-return",
        uris: [{ uri: "ssh://172.93.188.37" }]
      },
      fields: [
        { name: "ssh_private_key", value: "secret-key" },
        { name: "port", value: "22" }
      ]
    };

    expect(summarizeItem(item, policy)).toEqual({
      id: "item-1",
      name: "HK VPS",
      type: undefined,
      folderId: null,
      collectionIds: undefined,
      loginUsername: "root",
      uriHosts: ["172.93.188.37"],
      fieldNames: ["ssh_private_key", "port"],
      hasSshKey: true,
      allowed: true
    });
  });

  it("requires the configured codex tag by default", () => {
    expect(isAllowedItem({ notes: "codex:ssh" }, policy)).toBe(true);
    expect(isAllowedItem({ notes: "personal" }, policy)).toBe(false);
  });

  it("extracts SSH target details from custom fields", () => {
    const privateKey = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----";
    const target = extractSshTarget(
      {
        name: "HK VPS",
        notes: "codex:ssh",
        fields: [
          { name: "host", value: "172.93.188.37" },
          { name: "user", value: "root" },
          { name: "port", value: "22" },
          { name: "ssh_private_key", value: privateKey }
        ]
      },
      policy
    );

    expect(target).toMatchObject({
      alias: "HK VPS",
      host: "172.93.188.37",
      user: "root",
      port: 22,
      privateKey
    });
  });

  it("rejects untagged SSH targets", () => {
    expect(() =>
      extractSshTarget(
        {
          name: "HK VPS",
          fields: [
            { name: "host", value: "172.93.188.37" },
            { name: "user", value: "root" },
            { name: "ssh_private_key", value: "secret" }
          ]
        },
        policy
      )
    ).toThrow(/not allowed/);
  });
});

