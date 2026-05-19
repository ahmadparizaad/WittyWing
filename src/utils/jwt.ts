interface JWTPayload {
  iat?: number;
  exp?: number;
  id?: string;
  type?: string;
  displayName?: string;
  email?: string;
}

export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Pad base64url to standard base64
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as JWTPayload;
  } catch {
    return null;
  }
}

/** Returns true if the token expires within the given threshold (seconds). */
export function isTokenExpiringSoon(token: string, thresholdSeconds = 120): boolean {
  const payload = decodeJWT(token);
  if (!payload?.exp) return true;
  return payload.exp - Math.floor(Date.now() / 1000) <= thresholdSeconds;
}
