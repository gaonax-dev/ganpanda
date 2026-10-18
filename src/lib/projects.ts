// 프로젝트·초대·방 접근 API 클라이언트 (1-2b)
import { SERVER_URL } from './sync';
import { AuthError, loadSession } from './auth';
import type { Attachment } from './core/model';

export type Role = 'owner' | 'editor' | 'viewer';
export type ProjectStatus = 'waiting' | 'ongoing' | 'done';
export const STATUS_LABEL: Record<ProjectStatus, string> = { waiting: '대기', ongoing: '진행중', done: '완료' };
/** 그룹·상태·정산은 2026-10-15 추가. 계약 금액 = 직접 입력(contractAuto=false) 또는 리스트 뷰 견적 합계(quoteTotal, 자동). 금액은 정산을 볼 수 있는 사람에게만 온다 */
export interface ProjectInfo { id: string; name: string; createdAt: number; role: Role; groupId?: string | null; status: ProjectStatus; quoteTotal?: number; contractAmount?: number; contractAuto?: boolean; paidAmount?: number }
export interface GroupInfo { id: string; name: string; createdAt: number; role: 'owner' | 'member'; canBilling: boolean }
export interface TeamMember { accountId: string; email: string; name: string; canBilling: boolean; createdAt: number }
export interface GroupView { group: GroupInfo; projects: ProjectInfo[] }
export interface InviteInfo { id: string; role: Exclude<Role, 'owner'>; createdAt: number; revoked: boolean; /** 'proposal' = 제안 링크 */ kind?: string; /** 다시 복사용 (폐기·옛 링크는 없음) */ url?: string }

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

export const deleteProject = (id: string) => call<void>(`/api/projects/${id}`, { method: 'DELETE' });
export const updateProject = (id: string, body: { name?: string; groupId?: string | null; status?: ProjectStatus; contractAmount?: number | null; paidAmount?: number; quoteTotal?: number }) =>
  call<{ project: ProjectInfo }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.project);

// ---------- 프로젝트 그룹 (계산서를 그룹에서 한번에) ----------
export const listGroups = () => call<{ groups: GroupInfo[] }>('/api/groups').then((r) => r.groups);
export const createGroup = (name: string, projectIds: string[] = []) => call<{ group: GroupInfo }>('/api/groups', { method: 'POST', body: JSON.stringify({ name, projectIds }) }).then((r) => r.group);
export const getGroup = (id: string) => call<GroupView>(`/api/groups/${id}`);
export const deleteGroup = (id: string) => call<void>(`/api/groups/${id}`, { method: 'DELETE' });

// ---------- 팀 멤버 (설정에서 관리, 계정 단위) ----------
export const listTeam = () => call<{ members: TeamMember[] }>('/api/me/team').then((r) => r.members);
export const addTeamMember = (email: string, canBilling: boolean) =>
  call<{ member: TeamMember }>('/api/me/team', { method: 'POST', body: JSON.stringify({ email, canBilling }) }).then((r) => r.member);
export const setTeamMember = (accountId: string, canBilling: boolean) => call<void>(`/api/me/team/${accountId}`, { method: 'PATCH', body: JSON.stringify({ canBilling }) });
export const removeTeamMember = (accountId: string) => call<void>(`/api/me/team/${accountId}`, { method: 'DELETE' });

/** 방 접근 권한 (세션과 초대 토큰 중 있는 것으로) */
export const checkAccess = (room: string, invite: string | null) =>
  call<{ role: Role; project: { id: string; name: string }; seats: { used: number; limit: number }; billing?: boolean; /** 소유자가 무료 요금제: 제안 페이지에 간판다 표시 */ branding?: boolean; /** 요청에서 만든 프로젝트 (소유자에게만) — 앱이 요청 사진을 가져온다 */ requestId?: string }>(`/api/projects/${room}/access${invite ? `?invite=${invite}` : ''}`);

export const listInvites = (room: string) => call<{ invites: InviteInfo[] }>(`/api/projects/${room}/invites`).then((r) => r.invites);
/** kind 'proposal' = 제안 보내기 링크 (무료 요금제는 월 건수 한도 → 402 proposal_limit) */
export const createInvite = (room: string, role: 'viewer' | 'editor', kind?: 'proposal') =>
  call<{ token: string; role: Role; url: string }>(`/api/projects/${room}/invites`, { method: 'POST', body: JSON.stringify({ role, ...(kind ? { kind } : {}) }) });
export const revokeInvite = (room: string, inviteId: string) => call<void>(`/api/projects/${room}/invites/${inviteId}`, { method: 'DELETE' });

/** viewer 의 대화: 서버가 문서에 기록 */
export const postMessage = (room: string, invite: string | null, body: { objectId: string; author: string; text: string; kind: 'chat' | 'comment' | 'voice'; attachments?: Attachment[] }) =>
  call<void>(`/api/rooms/${room}/messages${invite ? `?invite=${invite}` : ''}`, { method: 'POST', body: JSON.stringify(body) });

/** viewer 가 자기 메시지 지우기 (2026-10-18) */
export const deleteMessage = (room: string, invite: string | null, body: { id: string; author: string }) =>
  call<{ ok: true }>(`/api/rooms/${room}/messages${invite ? `?invite=${invite}` : ''}`, { method: 'DELETE', body: JSON.stringify(body) });

/** 제안 승인: 누구나(viewer 포함) 서버를 통해 문서에 기록 */
export const postApproval = (room: string, invite: string | null, body: { by: string; hash: string; snapshot: unknown; proposalId?: string }) =>
  call<{ approval: { id: string } }>(`/api/rooms/${room}/approvals${invite ? `?invite=${invite}` : ''}`, { method: 'POST', body: JSON.stringify(body) });

/** viewer 의 핀: 서버가 문서에 기록 */
export const postPin = (room: string, invite: string | null, body: { photoId: string; x: number; y: number; author: string; to?: string }) =>
  call<{ pin: { id: string } }>(`/api/rooms/${room}/pins${invite ? `?invite=${invite}` : ''}`, { method: 'POST', body: JSON.stringify(body) });

export const ROLE_LABEL: Record<Role, string> = { owner: '소유자', editor: '편집', viewer: '보기·대화' };
