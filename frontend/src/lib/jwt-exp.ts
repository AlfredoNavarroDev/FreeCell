/** Decodifica (sin verificar firma) el campo `exp` de un JWT y lo devuelve en epoch ms. */
export function decodeJwtExpiry(jwt: string): number {
  const payload = jwt.split(".")[1];
  if (!payload) {
    throw new Error("Token JWT inválido: falta el payload");
  }
  const json = Buffer.from(payload, "base64url").toString("utf8");
  const parsed = JSON.parse(json) as { exp?: number };
  if (!parsed.exp) {
    throw new Error("Token JWT sin campo exp");
  }
  return parsed.exp * 1000;
}
