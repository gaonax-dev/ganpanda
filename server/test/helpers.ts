import { exports } from 'cloudflare:workers';

export const api = (path: string, init?: RequestInit) => exports.default.fetch('http://sync' + path, init);
export const json = (path: string, body: unknown, session?: string, method = 'POST') =>
  api(path, {
    method, body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
  });
export const get = (path: string, session?: string) =>
  api(path, { headers: session ? { authorization: `Bearer ${session}` } : {} });

/** 이메일 로그인 → 세션 */
export async function login(email: string): Promise<string> {
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
