// 기기 자료로 먼저 열기 (2026-10-27 사용자: "프로젝트 로딩이 너무 느리다 … 로컬에 자료를 가지고 있으면 안될까?" → "남은 것에 답이 있었네 진행해줘")
// 한 번 받은 서버 답(프로젝트 권한·내 계정·홈 목록)을 기기(localStorage)에 두고, 다음에 열 때 그걸로 바로 그린 뒤 서버 답이 오면 바꾼다.
// 같은 로그인(세션)·같은 초대 링크일 때만 쓴다 — 다른 계정으로 바뀌면 남의 것을 보이지 않는다.

const read = <T>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 용량·사생활 모드: 다음엔 서버를 기다린다 */ } };
const drop = (k: string) => { try { localStorage.removeItem(k); } catch { /* 없음 */ } };

/** 누구로 열었나: 세션 끝자리 + 초대 토큰 (세션 전체는 다시 적지 않는다) */
export const whoKey = (session: string | null, invite: string | null) => `${session ? session.slice(-12) : ''}|${invite ?? ''}`;

// ---------- 프로젝트 권한 ----------
const accessKey = (room: string) => `ganpanda.access.${room}`;
export function loadCachedAccess<A>(room: string, who: string): A | null {
  const c = read<{ who: string; access: A }>(accessKey(room));
  return c && c.who === who ? c.access : null;
}
export const saveCachedAccess = (room: string, who: string, access: unknown) => write(accessKey(room), { who, access, at: Date.now() });
export const dropCachedAccess = (room: string) => drop(accessKey(room));

// ---------- 내 계정 (/api/me) ----------
const ME_KEY = 'ganpanda.meCache';
export function loadCachedMe<M>(session: string | null): M | null {
  if (!session) return null;
  const c = read<{ who: string; me: M }>(ME_KEY);
  return c && c.who === whoKey(session, null) ? c.me : null;
}
export const saveCachedMe = (session: string, me: unknown) => write(ME_KEY, { who: whoKey(session, null), me });
export const dropCachedMe = () => drop(ME_KEY);

// ---------- 홈 목록 ----------
const homeKey = (accountId: string) => `ganpanda.home.${accountId}`;
export const loadCachedHome = <H>(accountId: string): H | null => read<H>(homeKey(accountId));
export const saveCachedHome = (accountId: string, home: unknown) => write(homeKey(accountId), home);
export const dropCachedHome = (accountId: string) => drop(homeKey(accountId));
