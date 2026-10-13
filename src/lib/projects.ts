// 프로젝트·초대·방 접근 API 클라이언트 (1-2b)
import { SERVER_URL } from './sync';
import { AuthError, loadSession } from './auth';

export type Role = 'owner' | 'editor' | 'viewer';
export interface ProjectInfo { id: string; name: string; createdAt: number; role: Role }
export interface InviteInfo { id: string; role: Exclude<Role, 'owner'>; createdAt: number; revoked: boolean }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SERVER_URL) throw new AuthError(0, '서버가 설정되지 않았습니다');
  const headers: Record<string, string> = {};
  if (init.body) headers['content-type'] = 'application/json';
  const session = loadSession();
  if (session) headers.authorization = `Bearer ${session}`;
  const r = await fetch(SERVER_URL + path, { ...init, headers });
  if (!r.ok) throw new AuthError(r.status, await r.text());
  return r.status === 204 ? (undefined as T) : r.json();
}

export const listProjects = () => call<{ projects: ProjectInfo[] }>('/api/projects').then((r) => r.projects);
export const createProject = (name: string) =>
  call<{ project: ProjectInfo }>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }).then((r) => r.project);

/** 방 접근 권한 (세션과 초대 토큰 중 있는 것으로) */
export const checkAccess = (room: string, invite: string | null) =>
  call<{ role: Role; project: { id: string; name: string }; seats: { used: number; limit: number } }>(`/api/projects/${room}/access${invite ? `?invite=${invite}` : ''}`);

export const listInvites = (room: string) => call<{ invites: InviteInfo[] }>(`/api/projects/${room}/invites`).then((r) => r.invites);
export const createInvite = (room: string, role: 'viewer' | 'editor') =>
  call<{ token: string; role: Role; url: string }>(`/api/projects/${room}/invites`, { method: 'POST', body: JSON.stringify({ role }) });
export const revokeInvite = (room: string, inviteId: string) => call<void>(`/api/projects/${room}/invites/${inviteId}`, { method: 'DELETE' });

/** viewer 의 대화: 서버가 문서에 기록 */
export const postMessage = (room: string, invite: string | null, body: { objectId: string; author: string; text: string; kind: 'chat' | 'comment' }) =>
  call<void>(`/api/rooms/${room}/messages${invite ? `?invite=${invite}` : ''}`, { method: 'POST', body: JSON.stringify(body) });

/** viewer 의 핀: 서버가 문서에 기록 */
export const postPin = (room: string, invite: string | null, body: { photoId: string; x: number; y: number; author: string }) =>
  call<{ pin: { id: string } }>(`/api/rooms/${room}/pins${invite ? `?invite=${invite}` : ''}`, { method: 'POST', body: JSON.stringify(body) });

export const ROLE_LABEL: Record<Role, string> = { owner: '소유자', editor: '편집', viewer: '보기·대화' };
