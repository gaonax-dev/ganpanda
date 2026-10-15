// 계정 API 클라이언트 (1-2a): 이메일 매직링크 → 세션 Bearer 토큰 (localStorage 'ganpanda.session')
import { SERVER_URL } from './sync';

export interface Account { id: string; email: string; name: string; plan: string; hasPassword?: boolean }
export interface Usage { limits: { storageBytes: number; seats: number }; usage: { storageBytes: number; seats: number } }
export type Me = { account: Account; prices: unknown } & Usage;
/** 계정 기본 단가표 저장 */
export const savePrices = (prices: unknown) => call<{ prices: unknown }>('/api/me/prices', { method: 'PUT', body: JSON.stringify({ prices }) });
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

/** 메일 링크 요청. reset = 비밀번호 재설정 링크 */
export const requestLink = (email: string, reset = false) =>
  call<{ ok: true; link?: string }>('/api/auth/email', { method: 'POST', body: JSON.stringify({ email, reset }) });

/** 메일 링크 검증 → 세션 저장. reset 이면 이어서 새 비밀번호를 정한다 */
export async function verifyLink(token: string): Promise<{ account: Account; reset: boolean }> {
  const r = await call<{ session: string; account: Account; reset?: boolean }>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }, null);
  saveSession(r.session);
  return { account: r.account, reset: !!r.reset };
}
export const verifyToken = (token: string) => verifyLink(token).then((r) => r.account);

/** 이메일·비밀번호 가입 (2026-10-15): 인증 메일을 보낸다 — 링크를 열어야 로그인된다. 개발 모드면 링크를 돌려준다 */
export const signup = (email: string, password: string, name: string) =>
  call<{ ok: true; link?: string }>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) }, null);
/** 인증 메일 다시 받기 */
export const resendVerify = (email: string) =>
  call<{ ok: true; link?: string }>('/api/auth/resend-verify', { method: 'POST', body: JSON.stringify({ email }) }, null);
export async function passwordLogin(email: string, password: string): Promise<Account> {
  const r = await call<{ session: string; account: Account }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, null);
  saveSession(r.session);
  return r.account;
}
/** 비밀번호 설정·변경 (재설정 링크로 들어온 직후에는 current 없이) */
export const setPassword = (password: string, current?: string) =>
  call<{ ok: true }>('/api/me/password', { method: 'POST', body: JSON.stringify({ password, current }) });
export const PASSWORD_MIN = 8;

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

/** 사람이 읽는 오류 문구. kind 에 따라 같은 상태 코드도 뜻이 다르다 */
export function describeAuthError(e: unknown, kind: 'link' | 'login' | 'signup' | 'password' = 'link'): string {
  const s = e instanceof AuthError ? e.status : -1;
  if (kind === 'login') {
    if (s === 401) return '이메일 또는 비밀번호가 맞지 않습니다.';
    if (s === 429) return '여러 번 틀려 15분 동안 잠겼습니다. [비밀번호 찾기]로 메일을 받아 다시 정하세요.';
    if (s === 403) return '이메일 인증이 아직 끝나지 않았습니다. 가입 때 받은 메일의 링크를 열어 주세요.';
    if (s === 400) return '이메일과 비밀번호를 입력해 주세요.';
  }
  if (kind === 'signup') {
    if (s === 409) return '이미 가입된 이메일입니다. 로그인하거나 [비밀번호 찾기]로 비밀번호를 정하세요.';
    if (s === 400) return `이메일 주소와 비밀번호(${PASSWORD_MIN}자 이상)를 확인해 주세요.`;
  }
  if (kind === 'password') {
    if (s === 403) return '현재 비밀번호가 맞지 않습니다.';
    if (s === 400) return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
  }
  if (s === 400) return '이메일 주소를 확인해 주세요.';
  if (s === 404 || s === 410) return '로그인 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.';
  if (s === 503) return '이메일 발송이 아직 설정되지 않았습니다.';
  if (s === 0) return '서버가 설정되지 않았습니다.';
  return '잠시 후 다시 시도해 주세요.';
}
