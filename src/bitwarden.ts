import { binaryStatus, runCommand } from "./cli.js";
import { redact } from "./redact.js";

export interface BwStatus {
  available: boolean;
  binary?: string;
  version?: string;
  server?: string;
  status?: "unauthenticated" | "locked" | "unlocked" | string;
  userEmail?: string;
  message?: string;
}

export class BitwardenCli {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async status(): Promise<BwStatus> {
    const binary = await binaryStatus("bw");
    if (!binary.available) {
      return {
        available: false,
        message:
          "Bitwarden CLI (bw) is not installed or not in PATH. Install it before using vault tools."
      };
    }

    const result = await runCommand("bw", ["status"], {
      env: this.env,
      timeoutMs: 5000
    });
    if (result.exitCode !== 0) {
      return {
        available: true,
        binary: binary.path,
        version: binary.version,
        message: redact(result.stderr || result.stdout)
      };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      return {
        available: true,
        binary: binary.path,
        version: binary.version,
        server: parsed.serverUrl,
        status: parsed.status,
        userEmail: parsed.userEmail
      };
    } catch {
      return {
        available: true,
        binary: binary.path,
        version: binary.version,
        message: redact(result.stdout)
      };
    }
  }

  async configureServer(serverUrl: string): Promise<{ serverUrl: string; stderr: string }> {
    const result = await runCommand("bw", ["config", "server", serverUrl], {
      env: this.env,
      timeoutMs: 10000
    });
    assertSuccess(result, "bw config server");
    return { serverUrl, stderr: redact(result.stderr.trim()) };
  }

  async loginWithApiKey(): Promise<{ status: string; message: string }> {
    const result = await runCommand("bw", ["login", "--apikey"], {
      env: this.env,
      timeoutMs: 20000
    });
    assertSuccess(result, "bw login --apikey");
    return {
      status: "login_invoked",
      message:
        "bw login --apikey completed. If the vault is locked, run bw unlock locally and expose BW_SESSION to Codex."
    };
  }

  async listItems(search?: string): Promise<unknown[]> {
    const args = ["list", "items"];
    if (search) {
      args.push("--search", search);
    }
    const result = await this.runJson(args, 30000);
    if (!Array.isArray(result)) {
      throw new Error("bw list items did not return an array.");
    }
    return result;
  }

  async getItem(itemId: string): Promise<unknown> {
    return this.runJson(["get", "item", itemId], 30000);
  }

  private async runJson(args: string[], timeoutMs: number): Promise<unknown> {
    const result = await runCommand("bw", args, {
      env: this.env,
      timeoutMs
    });
    assertSuccess(result, `bw ${args.join(" ")}`);
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`bw returned non-JSON output: ${redact(result.stdout).slice(0, 300)}`);
    }
  }
}

function assertSuccess(
  result: { exitCode: number | null; stdout: string; stderr: string },
  label: string
): void {
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed: ${redact(result.stderr || result.stdout).trim()}`);
  }
}

