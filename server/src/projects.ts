// 프로젝트(= 방)·초대 링크·접근 권한 (1-2b)
import { CREDIT_MONTH_LIMIT, creditsOn, photosOpen, requestFee } from './credit';
import { chargeCredit, reserveCredit } from './billing';
import { recordView } from './bypass';
import { isOperator } from './operator';
import { talkMember } from './talk';
import { authenticate, type Account } from './auth';
import { teamAccess } from './team';
import { json, randomToken, readJson, sha256hex, text } from './http';
import { planOf } from './plans';
import { businessOf } from './business';
import { proposalsThisMonth } from './usage';
import { recordResponse, shopCanSee, type RequestRow } from './requests';
import { settleKind } from './accountKind';

export type Role = 'owner' | 'editor' | 'viewer';
const INVITE_ROLES = new Set<Role>(['viewer', 'editor']);
const NAME_MAX = 60;

export interface ProjectRow { id: string; owner_id: string; name: string; created_at: number; /** 외주 폴더 (2026-10-22) */ outsource?: number; /** 가게 사장이 다른 간판집을 확정 (2026-10-22) */ lost_at?: number | null; request_id?: string | null; group_id?: string | null; status?: string; /** 'estimate' = 소비자 견적 요청 초안 (2026-10-22) */ kind?: string | null; /** 상세 (2026-10-21): 연락처·주소·계약일·시작일·완료일(YYYY-MM-DD)·메모 */ contact?: string; address?: string; contract_date?: string | null; start_date?: string | null; due_date?: string | null; memo?: string; /** 실측 상태용 사인물 수·미측정 수 (2026-10-21, 앱이 저장) */ sign_total?: number; sign_unmeasured?: number; /** 상태가 된 시각 (2026-10-21) */ status_at?: number | null; contract_amount?: number; paid_amount?: number; quote_total?: number; contract_override?: number | null }
interface InviteRow { token_hash: string; project_id: string; role: Role; created_at: number; revoked_at: number | null; kind?: string | null; /** 원문 (다시 복사용, 2026-10-17). 옛 링크는 null */ token?: string | null }

/** 방 ID: 16자 base64url (서버 ROOM_RE 와 호환) */
export const newRoomId = () => randomToken().slice(0, 16);
const inviteUrl = (env: Env, projectId: string, token: string) =>
  `${env.APP_URL.replace(/\/+$/, '')}/?room=${projectId}&invite=${token}`;
/** 공개 형태: 그룹·상태(대기/진행중/완료)·정산(계약·받은 금액) 포함 (2026-10-15) */
/** 계약 금액 = 사용자가 입력한 값(contract_override) 또는 리스트 뷰 견적 합계(quote_total, 앱이 저장). contractAuto = 자동 */
export const pubProject = (p: ProjectRow, role: Role) => ({
  id: p.id, name: p.name, createdAt: p.created_at, role,
  groupId: p.group_id ?? null, status: p.status ?? 'waiting', ...(p.status_at ? { statusAt: p.status_at } : {}), outsource: !!p.outsource, lost: !!p.lost_at,
  quoteTotal: p.quote_total ?? 0,
  signTotal: p.sign_total ?? 0, signUnmeasured: p.sign_unmeasured ?? 0,
  contact: p.contact ?? '', address: p.address ?? '', contractDate: p.contract_date ?? null, startDate: p.start_date ?? null, dueDate: p.due_date ?? null, memo: p.memo ?? '',
  contractAmount: p.contract_override ?? p.quote_total ?? 0, contractAuto: p.contract_override == null,
  paidAmount: p.paid_amount ?? 0,
  ...(p.request_id ? { requestId: p.request_id } : {}),
});
const pub = pubProject;
const STATUSES = new Set(['waiting', 'ongoing', 'paused', 'done']); // paused = 정지 (2026-10-21)
/** 상세 칸 (2026-10-21): 글은 자르고, 날짜는 YYYY-MM-DD 또는 빈 값(null). 형식이 틀리면 null 을 돌려 400 */
const DETAIL_TEXT = { contact: 80, address: 200, memo: 2000 } as const;
const DETAIL_DATE = { contractDate: 'contract_date', startDate: 'start_date', dueDate: 'due_date' } as const;
function detailSets(body: Record<string, unknown>): Record<string, unknown> | null {
  const sets: Record<string, unknown> = {};
  for (const [k, max] of Object.entries(DETAIL_TEXT)) { const v = body[k]; if (v === undefined) continue; if (typeof v !== 'string') return null; sets[k] = v.trim().slice(0, max); }
  for (const [k, col] of Object.entries(DETAIL_DATE)) { const v = body[k]; if (v === undefined) continue; if (v === null || v === '') { sets[col] = null; continue; } if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; sets[col] = v; }
  return sets;
}

const amount = (v: unknown): number | null | undefined => (v === undefined ? undefined : typeof v === 'number' && isFinite(v) && v >= 0 ? Math.round(v) : null);

export const getProject = (env: Env, id: string) => env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<ProjectRow>();

async function inviteByToken(env: Env, token: string): Promise<InviteRow | null> {
  const row = await env.DB.prepare('SELECT * FROM invites WHERE token_hash = ?').bind(await sha256hex(token)).first<InviteRow>();
  return row && !row.revoked_at ? row : null;
}

/**
 * 방 접근 권한: 소유자 세션 → owner, 초대 토큰 → 그 역할.
 * 반환: { role, project } | 상태 코드(401 자격 없음 / 403 권한 없음 / 404 방 없음)
 */
export async function resolveAccess(req: Request, env: Env, projectId: string, inviteToken: string | null)
  : Promise<{ role: Role; project: ProjectRow; account: Account | null } | 401 | 403 | 404> {
  const project = await getProject(env, projectId);
  if (!project) return 404;
  const account = await authenticate(req, env);
  // 요청 프로젝트(보드 복제, 2026-10-22): 누구에게나 읽기 전용 — 가게 사장(소유)과 그 요청을 볼 수 있는 간판집만
  if (project.kind === 'request') {
    if (!account) return 401;
    if (account.id === project.owner_id) return { role: 'viewer', project, account };
    const r = await env.DB.prepare('SELECT * FROM requests WHERE snapshot_project = ?').bind(project.id).first<RequestRow>();
    return r && (await shopCanSee(env, account, r)) ? { role: 'viewer', project, account } : 403;
  }
  if (account && account.id === project.owner_id) return { role: 'owner', project, account };
  // 톡방 멤버는 초대 링크 없이 들어온다 (2026-10-22 "링크를 누르면 해당 프로젝트의 링크로 이동"): 회사 멤버(팀) = editor, 그 밖 = viewer
  if (!inviteToken && account && (await talkMember(env, account.id, project.id))) {
    return { role: (await teamAccess(env, project.owner_id, account)) ? 'editor' : 'viewer', project, account };
  }
  if (inviteToken) {
    const inv = await inviteByToken(env, inviteToken);
    if (!inv) return account ? 403 : 401;
    if (inv.project_id !== project.id) return 403;
    return { role: inv.role, project, account };
  }
  return account ? 403 : 401;
}

export async function handleProjects(req: Request, env: Env, pathname: string, url: URL): Promise<Response> {
  // 초대 토큰 조회 (로그인 불필요)
  const inv = pathname.match(/^\/api\/invites\/([^/]+)$/);
  if (inv && req.method === 'GET') {
    const row = await inviteByToken(env, inv[1]);
    const project = row && (await getProject(env, row.project_id));
    if (!row || !project) return text('invite not found', 404);
    return json({ project: { id: project.id, name: project.name }, role: row.role });
  }

  // 방 접근 권한 (세션 또는 ?invite=)
  const access = pathname.match(/^\/api\/projects\/([^/]+)\/access$/);
  if (access && req.method === 'GET') {
    const r = await resolveAccess(req, env, access[1], url.searchParams.get('invite'));
    if (typeof r === 'number') return text('no access', r);
    const owner = await env.DB.prepare('SELECT plan FROM accounts WHERE id = ?').bind(r.project.owner_id).first<{ plan: string }>();
    const plan = planOf(owner?.plan ?? 'free');
    // 정산 보기(이익율): 오너, 또는 오너 팀에서 "정산 보기"를 켠 멤버가 편집 초대로 들어온 경우 (2026-10-16)
    const billing = r.role === 'owner' || (r.role === 'editor' && !!r.account && !!(await teamAccess(env, r.project.owner_id, r.account))?.canBilling);
    // branding: 소유자 요금제가 무료면 제안 페이지에 "간판다로 만든 제안" (2026-10-17)
    // requestId: 요청에서 만든 프로젝트 — 소유자 앱이 요청 사진을 가져오는 신호 (2026-10-17)
    // business: 소유자의 확인된 사업자(상호·상태) → 제안 페이지 "사업자 확인된 간판집" 배지 (2026-10-21)
    const biz = await businessOf(env, r.project.owner_id);
    // 고객이 제안 링크로 열었다 → 예약된 크레딧 결제 (2026-10-25). 소유자·회사 멤버의 미리보기는 아니다. 카카오톡 미리보기(OG) 봇은 /p/ 랜딩만 받고 여기는 부르지 않는다
    const inviteToken = url.searchParams.get('invite');
    if (inviteToken && r.role !== 'owner' && r.project.request_id && (await inviteByToken(env, inviteToken))?.kind === 'proposal' && !(r.account && (await teamAccess(env, r.project.owner_id, r.account)))) await settleCredit(env, r.project, true);
    // credit: 요청에서 가져온 내 프로젝트 — 첫 제안에 쓰일 크레딧 (2026-10-24). on = 실제 결제 여부(REQUEST_CREDITS)
    const credit = r.role === 'owner' && r.project.request_id && r.account ? { ...(await creditState(env, r.project.request_id, r.account)), on: creditsOn(env) && !isOperator(env, r.account.email) } : null;
    // 요청 보드를 여는 간판집: 열람 기록(신고 근거, 2026-10-24) + 제안 전엔 요청서 이름(가게 이름)을 가린다. 사진은 결제 전에도 원본 (2026-10-24 "원본 그대로")
    let unpaid = false;
    if (r.project.kind === 'request' && r.account && r.account.id !== r.project.owner_id) {
      const q = await env.DB.prepare('SELECT id FROM requests WHERE snapshot_project = ?').bind(r.project.id).first<{ id: string }>();
      if (q) await recordView(env, q.id, r.account.id);
      unpaid = !q || !(await photosOpen(env, r.account, q.id));
    }
    return json({ role: r.role, project: { id: r.project.id, name: unpaid ? '견적 요청서' : r.project.name /* 요청서 이름에 가게 이름 (2026-10-24 가림) */ }, ...(r.project.outsource && r.role !== 'viewer' ? { outsource: true } : {}), /* 외주 표시는 소유자·팀만 — 고객(보기·제안 링크)에게는 없다 (2026-10-24) */ ...(r.project.lost_at ? { lost: true } : {}), billing, branding: plan.branding, ...(biz ? { business: { name: biz.name, status: biz.status } } : {}), ...(r.role === 'owner' && r.project.request_id ? { requestId: r.project.request_id } : {}), ...(credit ? { credit } : {}) });
  }

  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);

  // 크레딧 다시 결제 (2026-10-25): 고객이 제안을 열었는데 카드 결제가 안 됐을 때 — 소유 간판집이 카드를 바꾸고 누른다
  const retry = pathname.match(/^\/api\/projects\/([^/]+)\/credit$/);
  if (retry && req.method === 'POST') {
    const project = await getProject(env, retry[1]);
    if (!project || project.owner_id !== me.id) return text('not found', 404);
    const c = await settleCredit(env, project, false);
    if (c === 'not_viewed') return json({ error: 'not_viewed' }, 409);
    return c === true ? json({ ok: true }) : json(c.body, c.status);
  }

  if (pathname === '/api/projects') {
    if (req.method === 'GET') {
      const rows = await env.DB.prepare("SELECT * FROM projects WHERE owner_id = ? AND (kind IS NULL OR kind NOT IN ('estimate', 'request')) ORDER BY created_at DESC, id").bind(me.id).all<ProjectRow>(); // 견적 초안은 목록에 안 보인다
      return json({ projects: rows.results.map((p) => pub(p, 'owner')) });
    }
    if (req.method === 'POST') {
      const body = await readJson<{ name?: string } & Record<string, unknown>>(req);
      const name = typeof body?.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
      if (!name) return text('bad name', 400);
      if ((await settleKind(env, me, 'shop')) === 'consumer') return json({ error: 'consumer_account' }, 403); // 가게 사장은 프로젝트를 못 만든다 — 간판집으로 전환 (2026-10-22)
      const details = detailSets(body ?? {}); // 연락처·주소·날짜·메모 (2026-10-21, 모두 선택)
      if (!details) return text('bad details', 400);
      const outsource = body?.outsource === true ? 1 : 0; // 만들기에서 외주 체크 (2026-10-22)
      const p: ProjectRow = { id: newRoomId(), owner_id: me.id, name, created_at: Date.now(), group_id: null, status: 'waiting', contract_amount: 0, paid_amount: 0, quote_total: 0, contract_override: null, outsource, ...details };
      const cols = ['id', 'owner_id', 'name', 'created_at', 'outsource', ...Object.keys(details)];
      await env.DB.prepare(`INSERT INTO projects (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(p.id, p.owner_id, p.name, p.created_at, outsource, ...Object.keys(details).map((k) => details[k])).run();
      return json({ project: pub(p, 'owner') }, 201);
    }
  }

  // 아래는 모두 소유자 전용
  const m = pathname.match(/^\/api\/projects\/([^/]+)(?:\/invites(?:\/([^/]+))?)?$/);
  if (!m) return text('not found', 404);
  const project = await getProject(env, m[1]);
  if (!project) return text('project not found', 404);
  if (project.owner_id !== me.id) return text('forbidden', 403);
  const sub = pathname.includes('/invites');
  const inviteId = m[2];

  if (!sub) {
    if (req.method === 'PATCH') {
      // 이름 · 그룹(내 그룹만, null = 그룹 없음) · 상태 · 계약 금액(숫자 = 직접 입력, null = 자동 계산 복구) · 받은 금액 · 견적 합계(앱이 저장) — 주어진 것만 바꾼다
      const body = await readJson<{ name?: string; groupId?: string | null; status?: string; contractAmount?: number | null; paidAmount?: number; quoteTotal?: number; statusAt?: number; signTotal?: number; signUnmeasured?: number }>(req);
      if (!body) return text('bad body', 400);
      // 주어진 칸만 UPDATE (2026-10-21): 앱이 견적 합계와 실측 수를 같은 순간에 따로 보내는데, 전체 행을 다시 쓰면 먼저 읽은 요청이 나중 값을 되돌렸다
      const next = { ...project };
      const sets: Record<string, unknown> = {};
      if (body.name !== undefined) { const name = typeof body.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : ''; if (!name) return text('bad name', 400); sets.name = name; }
      if (body.groupId !== undefined) {
        if (body.groupId === null) sets.group_id = null;
        else {
          const g = await env.DB.prepare('SELECT owner_id FROM groups WHERE id = ?').bind(body.groupId).first<{ owner_id: string }>();
          if (!g) return text('group not found', 404);
          if (g.owner_id !== me.id) return text('forbidden', 403);
          sets.group_id = body.groupId;
        }
      }
      if (body.status !== undefined) {
        if (typeof body.status !== 'string' || !STATUSES.has(body.status)) return text('bad status', 400);
        if (body.status !== (project.status ?? 'waiting')) sets.status_at = Date.now(); // 상태가 된 시각 — 홈 "지난 프로젝트" 접기 기준 (2026-10-21)
        sets.status = body.status;
      }
      if (typeof (body as { outsource?: unknown }).outsource === 'boolean') sets.outsource = (body as { outsource: boolean }).outsource ? 1 : 0; // 외주 폴더 (2026-10-22)
      if (typeof body.statusAt === 'number' && env.AUTH_DEV_LINK === '1') sets.status_at = body.statusAt; // 개발·E2E 전용: 옛 날짜 흉내
      const pd = amount(body.paidAmount), qt = amount(body.quoteTotal), st = amount(body.signTotal), su = amount(body.signUnmeasured);
      if (pd === null || qt === null || st === null || su === null) return text('bad amount', 400);
      if (st !== undefined) sets.sign_total = st; // 실측 상태 (2026-10-21)
      if (su !== undefined) sets.sign_unmeasured = su;
      if (body.contractAmount === null) sets.contract_override = null;
      else if (body.contractAmount !== undefined) { const c = amount(body.contractAmount); if (c === null || c === undefined) return text('bad amount', 400); sets.contract_override = c; }
      if (pd !== undefined) sets.paid_amount = pd;
      if (qt !== undefined) sets.quote_total = qt;
      const details = detailSets(body as Record<string, unknown>); // 상세 칸 (2026-10-21)
      if (!details) return text('bad details', 400);
      Object.assign(sets, details);
      const keys = Object.keys(sets);
      if (keys.length) {
        await env.DB.prepare(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => sets[k]), project.id).run();
        Object.assign(next, sets);
      }
      return json({ project: pub(next, 'owner') });
    }
    if (req.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM invites WHERE project_id = ?').bind(project.id),
        env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(project.id),
      ]);
      return new Response(null, { status: 204 });
    }
  } else if (!inviteId) {
    if (req.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM invites WHERE project_id = ? ORDER BY created_at').bind(project.id).all<InviteRow>();
      // 토큰은 돌려주지 않는다. id = 해시 앞 16자
      // url: 소유자가 다시 복사할 수 있게 (폐기된 것·옛 링크는 없음) — 2026-10-17 "초대링크 다시보낼수 있게 복사버튼"
      return json({ invites: rows.results.map((r) => ({ id: r.token_hash.slice(0, 16), role: r.role, createdAt: r.created_at, revoked: !!r.revoked_at, ...(r.kind ? { kind: r.kind } : {}), ...(r.token && !r.revoked_at ? { url: inviteUrl(env, project.id, r.token) } : {}) })) });
    }
    if (req.method === 'POST') {
      const body = await readJson<{ role?: Role; kind?: string }>(req);
      const role = body?.role;
      if (!role || !INVITE_ROLES.has(role)) return text('bad role', 400);
      // kind = 'proposal': 제안 보내기 링크 — 무료 요금제는 한 달 건수 한도 (2026-10-17). 보통 초대는 세지 않는다
      const kind = body?.kind === 'proposal' ? 'proposal' : null;
      // 요청에서 가져온 프로젝트의 첫 제안 = 크레딧 예약 (2026-10-25 "고객이 견적을 확인하면 그때 결제 … 간판집은 예약하고", 전엔 이때 결제) — 요금제 건수 대신.
      // 카드·한도(결제 + 예약)만 보고, 결제는 고객이 제안을 열 때(settleCredit). 운영자는 결제 없이 바로 열림
      const credit = kind && project.request_id && creditsOn(env) ? await creditState(env, project.request_id, me) : null;
      const free = !credit || isOperator(env, me.email);
      if (credit && !free && !credit.paid && !credit.reserved) {
        const c = await reserveCredit(env, me, credit.fee, CREDIT_MONTH_LIMIT, await reservedTotal(env, me.id));
        if (c !== true) return json(c.body, c.status);
      }
      if (kind && !credit) {
        const limit = planOf(me.plan).proposalsPerMonth;
        const used = limit === null ? 0 : await proposalsThisMonth(env, me.id);
        if (limit !== null && used >= limit) return json({ error: 'proposal_limit', used, limit }, 402);
      }
      const token = randomToken();
      await env.DB.prepare('INSERT INTO invites (token_hash, project_id, role, created_at, kind, token) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(await sha256hex(token), project.id, role, Date.now(), kind, token).run();
      if (kind) await recordResponse(env, project, `/p/${project.id}/${token}`, free); // 요청판 응답 기록 (경로만 — 앱이 서버 주소를 붙인다)
      return json({ token, role, url: inviteUrl(env, project.id, token) }, 201);
    }
  } else if (req.method === 'DELETE') {
    await env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE project_id = ? AND substr(token_hash, 1, 16) = ?')
      .bind(Date.now(), project.id, inviteId).run();
    return new Response(null, { status: 204 });
  }
  return text('not found', 404);
}

/**
 * 소비자 견적 요청 초안 프로젝트 (2026-10-22 사용자: "가게 사장님들 휴대폰에서 작성한 내용을 pc에서 확인을 못하는데"):
 * 계정당 하나(kind = 'estimate'), 보통 프로젝트처럼 서버 방으로 동기화되어 휴대폰에서 그린 것을 PC 에서 이어 본다. 목록·그룹에는 안 나온다
 */
export async function handleEstimateProject(req: Request, env: Env): Promise<Response> {
  const me = await authenticate(req, env);
  if (!me) return text('unauthorized', 401);
  if (req.method !== 'POST') return text('method not allowed', 405);
  if ((await settleKind(env, me, 'consumer')) === 'shop') return json({ error: 'shop_account' }, 403); // 간판집은 가게 사장 견적 요청을 못 쓴다 — 외주 요청으로 (2026-10-22)
  const found = await env.DB.prepare("SELECT * FROM projects WHERE owner_id = ? AND kind = 'estimate' ORDER BY created_at LIMIT 1").bind(me.id).first<ProjectRow>();
  if (found) return json({ project: pubProject(found, 'owner') });
  const p: ProjectRow = { id: newRoomId(), owner_id: me.id, name: '간판 견적 요청', created_at: Date.now(), group_id: null, status: 'waiting', contract_amount: 0, paid_amount: 0, quote_total: 0, contract_override: null, kind: 'estimate' };
  await env.DB.prepare("INSERT INTO projects (id, owner_id, name, created_at, kind) VALUES (?, ?, ?, ?, 'estimate')").bind(p.id, p.owner_id, p.name, p.created_at).run();
  return json({ project: pubProject(p, 'owner') }, 201);
}

/** 요청 하나에 대한 이 간판집의 크레딧: 금액(요청에 저장된 것), 결제됨(paid), 예약 중(reserved — 제안했지만 고객이 아직 안 열었거나 결제 실패), 결제 실패 사유 */
async function creditState(env: Env, requestId: string, me: { id: string }): Promise<{ fee: number; paid: boolean; reserved: boolean; error?: string }> {
  const r = await env.DB.prepare('SELECT fee, estimate_total FROM requests WHERE id = ?').bind(requestId).first<{ fee: number | null; estimate_total: number | null }>();
  const rr = await env.DB.prepare('SELECT paid_at, charge_error FROM request_responses WHERE request_id = ? AND account_id = ?').bind(requestId, me.id).first<{ paid_at: number | null; charge_error: string | null }>();
  return { fee: r?.fee ?? requestFee(r?.estimate_total), paid: !!rr?.paid_at, reserved: !!rr && !rr.paid_at, ...(rr && !rr.paid_at && rr.charge_error ? { error: rr.charge_error } : {}) };
}
/** 아직 결제되지 않은 예약 합계 — 한도에 함께 센다 */
async function reservedTotal(env: Env, accountId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(COALESCE(q.fee, 3000)), 0) AS n FROM request_responses rr JOIN requests q ON q.id = rr.request_id WHERE rr.account_id = ? AND rr.paid_at IS NULL').bind(accountId).first<{ n: number }>();
  return r?.n ?? 0;
}
/**
 * 예약된 크레딧 결제 (2026-10-25): 고객이 제안을 처음 열면(viewed) 소유 간판집의 등록 카드로 한 번. 동시에 두 번 열려도 charging_at 으로 한 번만.
 * 실패하면 charge_error 로 남기고 고객 화면은 막지 않는다 — 간판집이 [다시 결제](POST /api/projects/:id/credit). 크레딧이 꺼졌거나 운영자면 결제 없이 열림
 * 'not_viewed' = 고객이 아직 안 열었거나 결제할 예약이 없다
 */
async function settleCredit(env: Env, project: ProjectRow, viewed: boolean): Promise<true | 'not_viewed' | { status: 402 | 403 | 503; body: Record<string, unknown> }> {
  if (!project.request_id) return 'not_viewed';
  const now = Date.now(), key = [project.request_id, project.owner_id] as const;
  if (viewed) await env.DB.prepare('UPDATE request_responses SET viewed_at = ? WHERE request_id = ? AND account_id = ? AND viewed_at IS NULL').bind(now, ...key).run();
  const claim = await env.DB.prepare('UPDATE request_responses SET charging_at = ? WHERE request_id = ? AND account_id = ? AND paid_at IS NULL AND viewed_at IS NOT NULL AND (charging_at IS NULL OR charging_at < ?)').bind(now, ...key, now - 60_000).run();
  if (!claim.meta.changes) return 'not_viewed';
  const owner = await env.DB.prepare('SELECT id, email FROM accounts WHERE id = ?').bind(project.owner_id).first<{ id: string; email: string }>();
  const done = () => env.DB.prepare('UPDATE request_responses SET paid_at = ?, charging_at = NULL, charge_error = NULL WHERE request_id = ? AND account_id = ?').bind(Date.now(), ...key).run();
  if (!owner || !creditsOn(env) || isOperator(env, owner.email)) { await done(); return true; }
  const { fee } = await creditState(env, project.request_id, owner);
  const c = await chargeCredit(env, owner, project.request_id, fee, Infinity); // 한도는 예약 때 봤다
  if (c === true) { await done(); return true; }
  const msg = String(c.body.message ?? c.body.error ?? 'charge_failed');
  await env.DB.prepare('UPDATE request_responses SET charging_at = NULL, charge_error = ? WHERE request_id = ? AND account_id = ?').bind(msg, ...key).run();
  return c;
}
