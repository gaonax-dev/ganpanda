// 계정 API 클라이언트 (1-2a): 이메일 매직링크 → 세션 Bearer 토큰 (localStorage 'ganpanda.session')
import { SERVER_URL } from './sync';

export interface Account { id: string; email: string; name: string; plan: string }
export interface Usage { limits: { storageBytes: number; seats: number }; usage: { storageBytes: number; seats: number } }
export type Me = { account: Account } & Usage;
const KEY = 'ganpanda.session';

export const loadSession = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const saveSession = (s: string | null) => { try { s ? localStorage.setItem(KEY, s) : localStorage.removeItem(KEY); } catch { /* 저장 불가 환경 */ } };

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(path: string, init: RequestInit = {}, session = loadSession()): Promise<T> {
  if (!SERVER_URL) throw new AuthError(0, '서버가 설정되지 않았습니다');
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers['content-type'] = 'application/json';
  if (session) headers.authorization = `Bearer ${session}`;
  const r = await fetch(SERVER_URL + path, { ...init, headers });
  if (!r.ok) throw new AuthError(r.status, await r.text());
  return r.status === 204 ? (undefined as T) : r.json();
}

/** 매직링크 요청. 개발 모드면 서버가 링크를 돌려준다 */
export type SocialProvider = 'kakao' | 'google' | 'apple';
/** 서버에 자격이 설정된 소셜 공급자 */
export const fetchProviders = (): Promise<SocialProvider[]> =>
  call<{ providers: SocialProvider[] }>('/api/auth/providers').then((r) => r.providers).catch(() => []);
/** 소셜 로그인 시작 주소 (서버가 공급자로 보내고, 끝나면 /login#session= 으로 돌아온다) */
export const socialStartUrl = (p: SocialProvider, next: string) =>
  `${SERVER_URL}/api/auth/${p}/start?next=${encodeURIComponent(next)}`;

export const requestLink = (email: string) =>
  call<{ ok: true; link?: string }>('/api/auth/email', { method: 'POST', body: JSON.stringify({ email }) });

export async function verifyToken(token: string): Promise<Account> {
  const r = await call<{ session: string; account: Account }>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }, null);
  saveSession(r.session);
  return r.account;
}

export async function fetchMe(): Promise<Me | null> {
  if (!loadSession()) return null;
  try {
    return await call<Me>('/api/me');
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) saveSession(null); // 만료된 세션
    return null;
  }
}

export const updateName = (name: string) =>
  call<{ account: Account }>('/api/me', { method: 'PATCH', body: JSON.stringify({ name }) }).then((r) => r.account);

export async function logout() {
  try { await call('/api/auth/logout', { method: 'POST' }); } catch { /* 이미 만료 */ }
  saveSession(null);
}

/** 사람이 읽는 오류 문구 */
export function describeAuthError(e: unknown): string {
  const s = e instanceof AuthError ? e.status : -1;
  if (s === 400) return '이메일 주소를 확인해 주세요.';
  if (s === 404 || s === 410) return '로그인 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.';
  if (s === 503) return '이메일 발송이 아직 설정되지 않았습니다.';
  if (s === 0) return '서버가 설정되지 않았습니다.';
  return '잠시 후 다시 시도해 주세요.';
}
