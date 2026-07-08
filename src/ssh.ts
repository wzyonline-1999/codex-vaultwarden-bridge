import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { runCommand } from "./cli.js";
import { redact } from "./redact.js";
import type { SshTarget } from "./vault.js";

const DANGEROUS_PATTERNS = [
  /\brm\s+-[^\n]*r[^\n]*f\b/,
  /\bdd\s+.*\bof=/,
  /\bmkfs(\.\w+)?\b/,
  /\bshutdown\b/,
  /\bpoweroff\b/,
  /\breboot\b/,
  /\bsystemctl\s+(?:stop|restart|disable)\b/,
  /\biptables\b/,
  /\bufw\s+(?:disable|reset|delete)\b/
];

export function commandConfirmation(alias: string, command: string): string {
  const digest = createHash("sha256").update(command).digest("hex").slice(0, 12);
  return `run:${alias}:${digest}`;
}

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

export async function writeTemporaryPrivateKey(privateKey: string): Promise<string> {
  const dir = join(tmpdir(), "codex-vaultwarden-bridge");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `identity-${randomUUID()}`);
  await writeFile(path, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
    mode: 0o600
  });
  await chmod(path, 0o600);
  return path;
}

export async function addTargetToSshAgent(
  target: SshTarget,
  ttlSeconds: number
): Promise<{ alias: string; host: string; user: string; port: number; ttlSeconds: number; output: string }> {
  const keyPath = await writeTemporaryPrivateKey(target.privateKey);
  try {
    const result = await runCommand("ssh-add", ["-t", String(ttlSeconds), keyPath], {
      timeoutMs: 10000
    });
    if (result.exitCode !== 0) {
      throw new Error(redact(result.stderr || result.stdout).trim());
    }
    return {
      alias: target.alias,
      host: target.host,
      user: target.user,
      port: target.port,
      ttlSeconds,
      output: redact(result.stdout || result.stderr).trim()
    };
  } finally {
    await rm(keyPath, { force: true });
  }
}

export async function runSshCommand(
  target: SshTarget,
  command: string,
  options: { timeoutMs?: number; confirm?: string; useAgent?: boolean } = {}
): Promise<{
  alias: string;
  host: string;
  user: string;
  port: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  if (isDangerousCommand(command)) {
    const expected = commandConfirmation(target.alias, command);
    if (options.confirm !== expected) {
      throw new Error(`Dangerous command confirmation required. Expected: ${expected}`);
    }
  }

  const keyPath = options.useAgent ? undefined : await writeTemporaryPrivateKey(target.privateKey);
  try {
    const args = [
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-p",
      String(target.port)
    ];
    if (keyPath) {
      args.push("-i", keyPath, "-o", "IdentitiesOnly=yes");
    }
    args.push(`${target.user}@${target.host}`, command);

    const result = await runCommand("ssh", args, {
      timeoutMs: options.timeoutMs ?? 30000
    });
    return {
      alias: target.alias,
      host: target.host,
      user: target.user,
      port: target.port,
      exitCode: result.exitCode,
      stdout: redact(result.stdout),
      stderr: redact(result.stderr)
    };
  } finally {
    if (keyPath) {
      await rm(keyPath, { force: true });
    }
  }
}

