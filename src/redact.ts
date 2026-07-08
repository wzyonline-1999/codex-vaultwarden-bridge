const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const COMMON_TOKEN =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_=-]{32,}\.[A-Za-z0-9_=-]{16,}\.[A-Za-z0-9_=-]{16,})\b/g;

export function redact(text: string): string {
  return text
    .replace(PRIVATE_KEY_BLOCK, "[REDACTED_PRIVATE_KEY]")
    .replace(COMMON_TOKEN, "[REDACTED_TOKEN]");
}

export function redactObject<T>(value: T): T {
  if (typeof value === "string") {
    return redact(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item)) as T;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/password|secret|token|private|key|session|clientid|client_id/i.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactObject(item);
      }
    }
    return result as T;
  }
  return value;
}
