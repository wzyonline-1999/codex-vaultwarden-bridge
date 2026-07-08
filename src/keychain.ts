import { binaryStatus, runCommand, type CommandResult } from "./cli.js";

export const KEYCHAIN_SECRET_NAMES = [
  "BW_SERVER",
  "BW_CLIENTID",
  "BW_CLIENTSECRET",
  "BW_SESSION"
] as const;

export type KeychainSecretName = (typeof KEYCHAIN_SECRET_NAMES)[number];

export interface KeychainSecretStatus {
  name: KeychainSecretName;
  env: "set" | "not set";
  keychain: "set" | "not set" | "unsupported" | "unavailable" | "unknown";
}

export interface KeychainStatus {
  supported: boolean;
  service: string;
  security: {
    available: boolean;
    path?: string;
    version?: string;
  };
  secrets: KeychainSecretStatus[];
}

export interface KeychainWriteResult {
  service: string;
  saved: KeychainSecretName[];
}

export interface BuildEffectiveBwEnvOptions {
  ignoreKeychainErrors?: boolean;
}

export interface KeychainDeleteResult {
  service: string;
  deleted: KeychainSecretName;
  existed: boolean;
}

const DEFAULT_SERVICE = "codex-vaultwarden-bridge";

export function keychainService(env: NodeJS.ProcessEnv = process.env): string {
  return env.VAULTWARDEN_BRIDGE_KEYCHAIN_SERVICE || DEFAULT_SERVICE;
}

export function isKeychainSupported(platform = process.platform): boolean {
  return platform === "darwin";
}

export function isKeychainSecretName(value: string): value is KeychainSecretName {
  return (KEYCHAIN_SECRET_NAMES as readonly string[]).includes(value);
}

export async function buildEffectiveBwEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: BuildEffectiveBwEnvOptions = {}
): Promise<NodeJS.ProcessEnv> {
  if (!isKeychainSupported()) {
    return env;
  }

  const merged: NodeJS.ProcessEnv = { ...env };
  await Promise.all(
    KEYCHAIN_SECRET_NAMES.map(async (name) => {
      if (merged[name]) {
        return;
      }
      const value = await readKeychainSecret(name, env).catch((error) => {
        if (options.ignoreKeychainErrors) {
          return undefined;
        }
        throw error;
      });
      if (value) {
        merged[name] = value;
      }
    })
  );
  return merged;
}

export async function getKeychainStatus(
  env: NodeJS.ProcessEnv = process.env
): Promise<KeychainStatus> {
  const supported = isKeychainSupported();
  const service = keychainService(env);
  const security: { available: boolean; path?: string; version?: string } = supported
    ? await binaryStatus("security")
    : { available: false };

  const secrets = await Promise.all(
    KEYCHAIN_SECRET_NAMES.map(async (name): Promise<KeychainSecretStatus> => {
      if (!supported) {
        return { name, env: env[name] ? "set" : "not set", keychain: "unsupported" };
      }
      if (!security.available) {
        return { name, env: env[name] ? "set" : "not set", keychain: "unavailable" };
      }
      try {
        const value = await readKeychainSecret(name, env);
        return { name, env: env[name] ? "set" : "not set", keychain: value ? "set" : "not set" };
      } catch {
        return { name, env: env[name] ? "set" : "not set", keychain: "unknown" };
      }
    })
  );

  return {
    supported,
    service,
    security: {
      available: Boolean(security.available),
      path: security.path,
      version: security.version
    },
    secrets
  };
}

export async function readKeychainSecret(
  name: KeychainSecretName,
  env: NodeJS.ProcessEnv = process.env
): Promise<string | undefined> {
  const result = await runCommand(
    "security",
    ["find-generic-password", "-s", keychainService(env), "-a", name, "-w"],
    { timeoutMs: 5000 }
  );
  if (result.exitCode === 0) {
    const value = result.stdout.replace(/\r?\n$/, "");
    return value || undefined;
  }
  if (isMissingKeychainItem(result)) {
    return undefined;
  }
  throw new Error(`Unable to read ${name} from macOS Keychain.`);
}

export async function saveKeychainSecrets(
  values: Partial<Record<KeychainSecretName, string>>,
  env: NodeJS.ProcessEnv = process.env
): Promise<KeychainWriteResult> {
  assertKeychainAvailable();
  const saved: KeychainSecretName[] = [];
  for (const name of KEYCHAIN_SECRET_NAMES) {
    const value = values[name];
    if (!value) {
      continue;
    }
    const result = await runCommand(
      "security",
      ["add-generic-password", "-U", "-s", keychainService(env), "-a", name, "-w", value],
      { timeoutMs: 10000 }
    );
    if (result.exitCode !== 0) {
      throw new Error(`Unable to save ${name} to macOS Keychain.`);
    }
    saved.push(name);
  }
  if (!saved.length) {
    throw new Error("No non-empty Keychain values were provided.");
  }
  return { service: keychainService(env), saved };
}

export async function deleteKeychainSecret(
  name: KeychainSecretName,
  env: NodeJS.ProcessEnv = process.env
): Promise<KeychainDeleteResult> {
  assertKeychainAvailable();
  const result = await runCommand(
    "security",
    ["delete-generic-password", "-s", keychainService(env), "-a", name],
    { timeoutMs: 5000 }
  );
  if (result.exitCode === 0) {
    return { service: keychainService(env), deleted: name, existed: true };
  }
  if (isMissingKeychainItem(result)) {
    return { service: keychainService(env), deleted: name, existed: false };
  }
  throw new Error(`Unable to delete ${name} from macOS Keychain.`);
}

export function isMissingKeychainItem(result: CommandResult): boolean {
  const text = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return (
    result.exitCode !== 0 &&
    (text.includes("could not be found") ||
      text.includes("the specified item could not be found") ||
      text.includes("not found"))
  );
}

function assertKeychainAvailable(): void {
  if (!isKeychainSupported()) {
    throw new Error("macOS Keychain is only available on Darwin/macOS hosts.");
  }
}
