import { spawn } from "node:child_process";

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
}

export async function runCommand(
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;

    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeoutMs)
        : undefined;

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const result = {
        exitCode: code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr:
          Buffer.concat(stderr).toString("utf8") +
          (timedOut ? "\nCommand timed out." : "")
      };
      resolve(result);
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

export async function binaryStatus(binary: string): Promise<{
  binary: string;
  available: boolean;
  path?: string;
  version?: string;
}> {
  const located = await runCommand("which", [binary], { timeoutMs: 3000 });
  if (located.exitCode !== 0) {
    return { binary, available: false };
  }

  const version = await runCommand(binary, ["--version"], { timeoutMs: 3000 });
  return {
    binary,
    available: true,
    path: located.stdout.trim(),
    version: version.exitCode === 0 ? version.stdout.trim() : undefined
  };
}

