import { createHash } from "node:crypto";

export function normalizeCodeVerifier(value: string): string {
  return value.trim();
}

export function computePkceChallenge(codeVerifier: string): string {
  const normalizedVerifier = normalizeCodeVerifier(codeVerifier);
  return createHash("sha256")
    .update(normalizedVerifier, "utf8")
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
