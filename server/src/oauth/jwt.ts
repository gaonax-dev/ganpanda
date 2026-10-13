// JWT 도우미 (WebCrypto): 애플 client secret(ES256) 서명, 애플 id_token(RS256) 검증
const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

export function pemFromPkcs8(der: ArrayBuffer): string {
  const b = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN PRIVATE KEY-----\n${b.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
}

/** PEM(.p8) → ES256 서명 키. 환경 변수에는 줄바꿈이 \\n 으로 들어올 수 있다 */
export async function importP8(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** 헤더·본문을 서명해 JWT 문자열로. ES256(ECDSA P-256) 또는 RS256 */
export async function signJwt(header: { alg: 'ES256' | 'RS256'; kid?: string }, payload: Record<string, unknown>, key: CryptoKey): Promise<string> {
  const input = `${enc({ typ: 'JWT', ...header })}.${enc(payload)}`;
  const algo = header.alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' };
  const sig = await crypto.subtle.sign(algo, key, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

/** 애플 토큰 교환용 client secret (최대 6개월 유효 — 여기서는 1시간) */
export async function appleClientSecret(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await importP8(env.APPLE_PRIVATE_KEY);
  return signJwt({ alg: 'ES256', kid: env.APPLE_KEY_ID }, {
    iss: env.APPLE_TEAM_ID, iat: now, exp: now + 3600, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID,
  }, key);
}

export function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } | null {
  try {
    const [h, p] = token.split('.');
    return { header: JSON.parse(new TextDecoder().decode(b64urlDecode(h))), payload: JSON.parse(new TextDecoder().decode(b64urlDecode(p))) };
  } catch { return null; }
}

/** RS256 JWT 를 JWKS 로 검증. 서명·만료가 맞으면 payload, 아니면 null */
export async function verifyJwtRS256(token: string, jwks: JsonWebKey[]): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const d = decodeJwt(token);
  if (!d || d.header.alg !== 'RS256') return null;
  const jwk = jwks.find((k) => (k as { kid?: string }).kid === d.header.kid) ?? jwks[0];
  if (!jwk) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64urlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
  } catch { return null; }
  const exp = d.payload.exp as number | undefined;
  if (exp && exp * 1000 < Date.now()) return null;
  return d.payload;
}
