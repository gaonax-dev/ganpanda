// 프로젝트·초대·방 접근 API 클라이언트 (1-2b)
import { SERVER_URL } from './sync';
import { AuthError, loadSession } from './auth';
import type { Attachment } from './core/model';

export type Role = 'owner' | 'editor' | 'viewer';
export type ProjectStatus = 'waiting' | 'ongoing' | 'paused' | 'done';
/** 정지(paused)는 2026-10-21 추가 — 홈 선택 탭 [진행 · 정지 · 완료] */
export const STATUS_LABEL: Record<ProjectStatus, string> = { waiting: '대기', ongoing: '진행중', paused: '정지', done: '완료' };
/** 그룹·상태·정산은 2026-10-15 추가. 계약 금액 = 직접 입력(contractAuto=false) 또는 리스트 뷰 견적 합계(quoteTotal, 자동). 금액은 정산을 볼 수 있는 사람에게만 온다 */
export interface ProjectInfo { id: string; name: string; createdAt: number; role: Role; groupId?: string | null; status: ProjectStatus; /** 상태가 된 시각 (2026-10-21) */ statusAt?: number; /** 실측 상태: 사인물 수·미측정 수 (앱이 저장, 2026-10-21) */ signTotal?: number; signUnmeasured?: number; /** 상세 (2026-10-21, 모두 선택) */ contact?: string; address?: string; contractDate?: string | null; startDate?: string | null; dueDate?: string | null; memo?: string; quoteTotal?: number; contractAmount?: number; contractAuto?: boolean; paidAmount?: number; /** 외주 폴더 (2026-10-22) */ outsource?: boolean }
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
/** 소비자 견적 요청 초안 방 (계정당 하나, 2026-10-22) */
export const estimateProject = () => call<{ project: ProjectInfo }>('/api/estimate/project', { method: 'POST', body: '{}' }).then((r) => r.project);
/** 상세 칸 (2026-10-21): 연락처·주소·계약일·시작일·완료일(YYYY-MM-DD, 빈 값 = 지움)·메모 */
export interface ProjectDetails { contact?: string; address?: string; contractDate?: string | null; startDate?: string | null; dueDate?: string | null; memo?: string }
export const createProject = (name: string, details: ProjectDetails = {}, outsource = false) =>
  call<{ project: ProjectInfo }>('/api/projects', { method: 'POST', body: JSON.stringify({ name, ...details, ...(outsource ? { outsource: true } : {}) }) }).then((r) => r.project);

export const deleteProject = (id: string) => call<void>(`/api/projects/${id}`, { method: 'DELETE' });
export const updateProject = (id: string, body: ProjectDetails & { name?: string; groupId?: string | null; status?: ProjectStatus; contractAmount?: number | null; paidAmount?: number; quoteTotal?: number; signTotal?: number; signUnmeasured?: number; /** 개발·E2E 전용 */ statusAt?: number; /** 외주 폴더 */ outsource?: boolean }) =>
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
  call<{ role: Role; project: { id: string; name: string }; billing?: boolean; /** 소유자가 무료 요금제: 제안 페이지에 간판다 표시 */ branding?: boolean; /** 소유자의 확인된 사업자 → 제안 페이지 배지 (2026-10-21) */ business?: { name: string; status: string }; /** 요청에서 만든 프로젝트 (소유자에게만) — 앱이 요청 사진을 가져온다 */ requestId?: string; /** 외주 프로젝트 (2026-10-22) */ outsource?: boolean }>(`/api/projects/${room}/access${invite ? `?invite=${invite}` : ''}`);

/** 버전 기록 (2026-10-21 백업 3단계, 유료 — 무료는 402 plan_required): auto = 매시간 자동(그날 마지막), manual = 직접 저장, before = 되돌리기 직전 */
export interface VersionInfo { key: string; kind: 'auto' | 'manual' | 'before'; at: number; label?: string; by?: string }
const inviteQ = (invite: string | null) => (invite ? `?invite=${invite}` : '');
export const listVersions = (room: string, invite: string | null) => call<{ versions: VersionInfo[] }>(`/api/projects/${room}/versions${inviteQ(invite)}`).then((r) => r.versions);
export const saveVersion = (room: string, invite: string | null, label: string) =>
  call<{ version: VersionInfo }>(`/api/projects/${room}/versions${inviteQ(invite)}`, { method: 'POST', body: JSON.stringify({ label }) }).then((r) => r.version);
export const restoreVersion = (room: string, invite: string | null, key: string) =>
  call<{ ok: boolean }>(`/api/projects/${room}/versions/restore${inviteQ(invite)}`, { method: 'POST', body: JSON.stringify({ key }) });
export const copyVersion = (room: string, invite: string | null, key: string) =>
  call<{ project: { id: string; name: string } }>(`/api/projects/${room}/versions/copy${inviteQ(invite)}`, { method: 'POST', body: JSON.stringify({ key }) }).then((r) => r.project);

export const listInvites = (room: string) => call<{ invites: InviteInfo[] }>(`/api/projects/${room}/invites`).then((r) => r.invites);
/** kind 'proposal' = 제안 보내기 링크 (무료 요금제는 월 건수 한도 → 402 proposal_limit) */
export const createInvite = (room: string, role: 'viewer' | 'editor', kind?: 'proposal') =>
  call<{ token: string; role: Role; url: string }>(`/api/projects/${room}/invites`, { method: 'POST', body: JSON.stringify({ role, ...(kind ? { kind } : {}) }) });
export const revokeInvite = (room: string, inviteId: string) => call<void>(`/api/projects/${room}/invites/${inviteId}`, { method: 'DELETE' });

/** viewer 의 대화: 서버가 문서에 기록 */
export const postMessage = (room: string, invite: string | null, body: { objectId: string; author: string; text: string; kind: 'chat' | 'comment' | 'voice'; attachments?: Attachment[] }) =>
  call<void>(`/api/rooms/${room}/messages${invite ? `?invite=${invite}` : ''}`, { method: 'POST', body: JSON.stringify(body) });

/** 사양 글 개인 사전 (2026-10-18 V1) */
export const getSpecRules = () => call<{ rules: { phrase: string; meaning: unknown[] }[] }>('/api/me/spec-rules').then((r) => r.rules);
export const putSpecRule = (rule: { phrase: string; meaning: unknown[] }) => call<{ rule: unknown }>('/api/me/spec-rules', { method: 'PUT', body: JSON.stringify(rule) });
export const deleteSpecRule = (phrase: string) => call<{ ok: true }>('/api/me/spec-rules', { method: 'DELETE', body: JSON.stringify({ phrase }) });
/** 전국 기본값 (V2): 말마다 대세 뜻 */
export const getSpecDefaults = () => call<{ defaults: { phrase: string; meaning: unknown[]; count: number }[] }>('/api/spec-rules/defaults').then((r) => r.defaults);
/** 같은 말에 다른 계정들이 정한 뜻 — 계정 수 순 (추천은 대세) */
export const suggestSpecRule = (phrase: string) => call<{ suggestions: { meaning: unknown[]; count: number; regionCount?: number }[]; region?: string | null }>(`/api/spec-rules/suggest?phrase=${encodeURIComponent(phrase)}`).then((r) => r.suggestions);

/** 퀵입력이 못 알아본 글 표본 보내기 (2026-10-18 "메모로 전환하는 글만 모아서") — 실패해도 조용히 */
export const postSpecSample = (body: { text: string; leftover: string; recognized: string[]; productId?: string }) =>
  call<{ id: string }>('/api/spec-samples', { method: 'POST', body: JSON.stringify(body) });

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
