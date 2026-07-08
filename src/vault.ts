export interface VaultItemSummary {
  id: string;
  name: string;
  type?: number;
  folderId?: string | null;
  collectionIds?: string[];
  loginUsername?: string;
  uriHosts?: string[];
  fieldNames: string[];
  hasSshKey: boolean;
  allowed: boolean;
}

export interface SshTarget {
  alias: string;
  host: string;
  user: string;
  port: number;
  privateKey: string;
  publicKey?: string;
}

export interface BridgePolicy {
  allowedTag: string;
  requireTag: boolean;
}

export function summarizeItem(item: unknown, policy: BridgePolicy): VaultItemSummary {
  const record = asRecord(item);
  const login = asRecord(record.login);
  const fields = getFields(record);
  return {
    id: stringValue(record.id),
    name: stringValue(record.name),
    type: typeof record.type === "number" ? record.type : undefined,
    folderId: typeof record.folderId === "string" ? record.folderId : null,
    collectionIds: Array.isArray(record.collectionIds)
      ? record.collectionIds.filter((value): value is string => typeof value === "string")
      : undefined,
    loginUsername: typeof login.username === "string" ? login.username : undefined,
    uriHosts: uriHosts(login),
    fieldNames: fields.map((field) => field.name).filter(Boolean),
    hasSshKey: Boolean(extractPrivateKey(record)),
    allowed: isAllowedItem(record, policy)
  };
}

export function isAllowedItem(item: unknown, policy: BridgePolicy): boolean {
  if (!policy.requireTag) {
    return true;
  }
  const record = asRecord(item);
  const notes = typeof record.notes === "string" ? record.notes : "";
  if (notes.includes(policy.allowedTag)) {
    return true;
  }
  return getFields(record).some((field) => {
    const name = field.name.toLowerCase();
    const value = String(field.value ?? "");
    return (
      (name === "codex" || name === "tags" || name === "tag") &&
      value.split(/[,\s]+/).includes(policy.allowedTag)
    );
  });
}

export function extractSshTarget(item: unknown, policy: BridgePolicy): SshTarget {
  const record = asRecord(item);
  if (!isAllowedItem(record, policy)) {
    throw new Error(
      `Vault item is not allowed for Codex use. Add ${policy.allowedTag} to notes or a custom field.`
    );
  }

  const alias = stringValue(record.name);
  const login = asRecord(record.login);
  const host =
    firstField(record, ["host", "hostname", "ssh_host", "server", "ip"]) ??
    firstUriHost(login);
  const user =
    firstField(record, ["user", "username", "ssh_user", "login_user"]) ??
    (typeof login.username === "string" ? login.username : undefined);
  const portRaw = firstField(record, ["port", "ssh_port"]) ?? "22";
  const port = Number.parseInt(portRaw, 10);
  const privateKey = extractPrivateKey(record);
  const publicKey =
    firstField(record, ["ssh_public_key", "public_key"]) ??
    stringFromPath(record, ["sshKey", "publicKey"]);

  if (!host) throw new Error(`Vault item "${alias}" does not include an SSH host.`);
  if (!user) throw new Error(`Vault item "${alias}" does not include an SSH user.`);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Vault item "${alias}" has an invalid SSH port.`);
  }
  if (!privateKey) throw new Error(`Vault item "${alias}" does not include an SSH private key.`);

  return { alias, host, user, port, privateKey, publicKey };
}

function extractPrivateKey(record: Record<string, unknown>): string | undefined {
  return (
    stringFromPath(record, ["sshKey", "privateKey"]) ??
    firstField(record, [
      "ssh_private_key",
      "private_key",
      "identity_private_key",
      "identity_file"
    ]) ??
    privateKeyFromNotes(record)
  );
}

function privateKeyFromNotes(record: Record<string, unknown>): string | undefined {
  if (typeof record.notes !== "string") {
    return undefined;
  }
  const match = record.notes.match(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/
  );
  return match?.[0];
}

function firstField(record: Record<string, unknown>, names: string[]): string | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const field of getFields(record)) {
    if (wanted.has(field.name.toLowerCase()) && field.value) {
      return String(field.value);
    }
  }
  return undefined;
}

function getFields(record: Record<string, unknown>): Array<{ name: string; value?: unknown }> {
  if (!Array.isArray(record.fields)) {
    return [];
  }
  return record.fields
    .filter((field): field is Record<string, unknown> => Boolean(field && typeof field === "object"))
    .map((field) => ({
      name: typeof field.name === "string" ? field.name : "",
      value: field.value
    }));
}

function uriHosts(login: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(login.uris)) {
    return undefined;
  }
  const hosts = login.uris
    .map((uri) => asRecord(uri).uri)
    .filter((uri): uri is string => typeof uri === "string")
    .map(hostFromUri)
    .filter((host): host is string => Boolean(host));
  return hosts.length ? hosts : undefined;
}

function firstUriHost(login: Record<string, unknown>): string | undefined {
  return uriHosts(login)?.[0];
}

function hostFromUri(uri: string): string | undefined {
  try {
    return new URL(uri).hostname;
  } catch {
    return uri.includes(":") ? uri.split(":")[0] : uri;
  }
}

function stringFromPath(record: Record<string, unknown>, path: string[]): string | undefined {
  let value: unknown = record;
  for (const key of path) {
    value = asRecord(value)[key];
  }
  return typeof value === "string" && value ? value : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

