// 비밀번호 해시 (PBKDF2-SHA256, Workers WebCrypto). 저장 형식 "pbkdf2$<반복>$<salt b64>$<hash b64>"
const ITER = 100_000; // Workers 의 PBKDF2 상한
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [kind, iter, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = await derive(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i]; // 상수 시간 비교
  return diff === 0;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
export const validPassword = (p: unknown): p is string => typeof p === 'string' && p.length >= PASSWORD_MIN && p.length <= PASSWORD_MAX;
