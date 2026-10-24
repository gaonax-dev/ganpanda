import { exports } from 'cloudflare:workers';
import { env } from 'cloudflare:test';
import { setNtsFetch } from '../src/business';

export const api = (path: string, init?: RequestInit) => exports.default.fetch('http://sync' + path, init);
export const json = (path: string, body: unknown, session?: string, method = 'POST') =>
  api(path, {
    method, body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
  });
export const get = (path: string, session?: string) =>
  api(path, { headers: session ? { authorization: `Bearer ${session}` } : {} });

/** 가입된(인증된) 계정을 DB 에 바로 만든다 — 메일 링크 로그인은 이미 있는 계정만 (2026-10-24: 이메일 가입은 사업자 확인을 거친다) */
export async function ensureAccount(email: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO accounts (id, email, name, plan, created_at, email_verified) VALUES (?, ?, ?, ?, ?, 1)')
    .bind(crypto.randomUUID(), email.trim().toLowerCase(), '', 'free', Date.now()).run();
}

/** 9자리 + 검증 자릿수 = 유효한 사업자등록번호 */
export const bizNo = (nine: string) => { const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let sum = 0; for (let i = 0; i < 9; i++) sum += Number(nine[i]) * w[i]; sum += Math.floor((Number(nine[8]) * 5) / 10); return nine + String((10 - (sum % 10)) % 10); };
/** 테스트마다 다른 번호의 사업자 입력 (대표자 홍길동) */
export const bizInput = () => ({ no: bizNo(String(100000000 + Math.floor(Math.random() * 800000000))), ownerName: '홍길동', startDate: '2020-01-05', name: '테스트 상회' });
/** 가짜 국세청: 대표자명 '홍길동' 이면 일치 */
export function fakeNts() {
  setNtsFetch(async (_input, init) => {
    const b = JSON.parse(String(init?.body ?? '{}')).businesses?.[0];
    return new Response(JSON.stringify({ data: [{ valid: b?.p_nm === '홍길동' ? '01' : '02', status: { b_stt_cd: '01' } }] }), { headers: { 'content-type': 'application/json' } });
  });
}

/** 이메일 로그인 → 세션 */
export async function login(email: string): Promise<string> {
  await ensureAccount(email);
  const r = await json('/api/auth/email', { email });
  const token = new URL((await r.json<{ link: string }>()).link).searchParams.get('token')!;
  return (await (await json('/api/auth/verify', { token })).json<{ session: string }>()).session;
}

export async function createProject(session: string, name = '테스트 매장') {
  const r = await json('/api/projects', { name }, session);
  if (r.status !== 201) throw new Error('create project failed ' + r.status);
  return (await r.json<{ project: { id: string; name: string } }>()).project;
}

export async function createInvite(session: string, projectId: string, role: 'viewer' | 'editor') {
  const r = await json(`/api/projects/${projectId}/invites`, { role }, session);
  if (r.status !== 201) throw new Error('create invite failed ' + r.status);
  return r.json<{ token: string; url: string; role: string }>();
}
