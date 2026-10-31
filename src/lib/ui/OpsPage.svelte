<!-- 관리자 페이지 (2026-10-27 "관리자가 페이지가 없다. 우선 가입 계정을 보고 싶어" — 맨 앞 [회원] 탭: 가입 계정 목록·요약)
  운영자 신고 처리 (2026-10-26 사용자: "운영자 신고 처리 화면 만들어줘") — /ops, 운영자 계정만.
  [대화·사용자 신고]: 신고 카드(이유·메시지 글(서버가 남긴 증거)·자세한 내용·신고자·경과 시간 — 20시간이 넘은 처리 대기는 빨강, 앱스토어 1.2 는 24시간 안 처리)
    → [메시지 숨김](문서에서 삭제) · [기각]. [간판다 밖 거래 신고](2026-10-24 bypass): 열람한 간판집마다 [위약금 부과] · [기각], 요청 받기 [정지 풀기] -->
<script lang="ts">
  import BackLink from './BackLink.svelte';
  import KitOpsSection from './KitOpsSection.svelte';
  import { askConfirm } from './ask.svelte';
  import { app } from '../state.svelte';
  import { listAccounts, type AdminAccount, type AdminSummary } from '../projects';
  import { actOnMember, decideAppeal, listAppeals, listBypassReports, listContentReports, resolveBypassReport, resolveContentReport, searchMembers, unblockRequests, type Appeal, type BypassReport, type ContentReport, type MemberAction, type MemberRecord } from '../projects';
  import { askPrompt } from './ask.svelte';

  let tab = $state<'accounts' | 'content' | 'bypass' | 'members' | 'kit'>('accounts');
  // ---- 가입 계정 목록 (2026-10-27) ----
  let accounts = $state<AdminAccount[]>([]);
  let summary = $state<AdminSummary | null>(null);
  let accQ = $state('');
  let accKind = $state('');
  let accNext = $state<number | null>(null);
  async function loadAccounts(more = false) {
    error = '';
    try {
      const r = await listAccounts(accQ.trim(), accKind, more ? accNext ?? 0 : 0);
      accounts = more ? [...accounts, ...r.accounts] : r.accounts;
      summary = r.summary; accNext = r.next;
    } catch (e) { if ((e as { status?: number }).status === 403) forbidden = true; else error = '회원 목록을 불러오지 못했습니다.'; }
  }
  const KIND: Record<string, string> = { shop: '간판집', consumer: '가게 사장' };
  const day = (ts: number | null) => (ts ? new Date(ts).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }) : '-');
  // ---- 회원 조치 · 이의 신청 (2026-10-27 약관 개정안 제5조의2) ----
  let q = $state('');
  let members = $state<MemberRecord[]>([]);
  let appeals = $state<Appeal[]>([]);
  let searched = $state(false);
  const STATUS: Record<MemberRecord['status'], string> = { active: '이용 중', suspended: '기간 정지', banned: '영구 정지' };
  const ACTION: Record<MemberAction, string> = { warn: '경고', suspend: '정지', ban: '영구 정지', lift: '해제' };
  async function search(term = q) {
    q = term; error = '';
    try { members = await searchMembers(term.trim()); searched = true; } catch { error = '회원을 찾지 못했습니다.'; }
  }
  async function memberAct(m: MemberRecord, action: MemberAction, days?: number) {
    const what = action === 'suspend' ? `${days}일 이용 정지` : ACTION[action];
    const reason = await askPrompt(`${m.email} — ${what}\n\n사유 (회원에게 이메일로 알립니다)`, '');
    if (reason === null) return;
    busy = m.id;
    try { await actOnMember(m.id, action, reason, days); await search(q || m.id); } catch { error = '조치하지 못했습니다.'; } finally { busy = ''; }
  }
  async function decide(a: Appeal, decision: 'accept' | 'reject') {
    const reply = await askPrompt(decision === 'accept' ? `${a.email} 이의 신청을 받아들여 이용 제한을 풉니다.\n\n회원에게 보낼 말 (선택)` : `${a.email} 이의 신청을 기각합니다.\n\n사유 (회원에게 이메일로 알립니다)`, '');
    if (reply === null) return;
    busy = a.id;
    try { await decideAppeal(a.id, decision, reply); appeals = await listAppeals(); } catch { error = '처리하지 못했습니다.'; } finally { busy = ''; }
  }
  async function openMember(id: string) { tab = 'members'; await search(id); }
  let filter = $state<'open' | 'all'>('all');
  let content = $state<ContentReport[]>([]);
  let bypass = $state<BypassReport[]>([]);
  let loaded = $state(false);
  let forbidden = $state(false);
  let busy = $state('');
  let error = $state('');

  async function load() {
    error = '';
    try {
      [content, bypass, appeals] = await Promise.all([listContentReports(), listBypassReports(), listAppeals()]);
      app.opsOpen = content.filter((r) => r.status === 'open').length;
    } catch (e) { if ((e as { status?: number }).status === 403) forbidden = true; else error = '신고 목록을 불러오지 못했습니다.'; }
    loaded = true;
  }
  $effect(() => { if (app.account?.operator) { void load(); void loadAccounts(); } else if (app.authReady) { forbidden = true; loaded = true; } });

  const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
  const when = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ageH = (ts: number) => (Date.now() - ts) / 3_600_000;
  const age = (ts: number) => { const h = ageH(ts); return h < 1 ? `${Math.max(1, Math.round(h * 60))}분 전` : h < 48 ? `${Math.floor(h)}시간 전` : `${Math.floor(h / 24)}일 전`; };
  const shownContent = $derived(content.filter((r) => filter === 'all' || r.status === 'open'));
  const shownBypass = $derived(bypass.filter((r) => filter === 'all' || r.status === 'open'));

  async function act(r: ContentReport, action: 'hide' | 'dismiss') {
    const msg = action === 'hide' ? `이 메시지를 숨길까요? (문서에서 지워집니다)\n\n"${r.excerpt.slice(0, 80)}"` : '이 신고를 기각할까요? (조치 없음)';
    if (!(await askConfirm(msg))) return;
    busy = r.id;
    try { await resolveContentReport(r.id, action); await load(); } catch { error = '처리하지 못했습니다. 잠시 뒤 다시 해 주세요.'; } finally { busy = ''; }
  }
  async function penalize(r: BypassReport, accountId: string, who: string) {
    if (!(await askConfirm(`${who} 에 위약금 ${won(r.penalty)}을 부과하고 요청 받기를 정지할까요?`))) return;
    busy = r.id;
    try { await resolveBypassReport(r.id, 'penalize', accountId); await load(); } catch { error = '처리하지 못했습니다.'; } finally { busy = ''; }
  }
  async function dismissBypass(r: BypassReport) {
    if (!(await askConfirm('이 신고를 기각할까요?'))) return;
    busy = r.id;
    try { await resolveBypassReport(r.id, 'dismiss'); await load(); } catch { error = '처리하지 못했습니다.'; } finally { busy = ''; }
  }
  async function unblock(accountId: string) {
    busy = accountId;
    try { await unblockRequests(accountId); await load(); } catch { error = '정지를 풀지 못했습니다.'; } finally { busy = ''; }
  }
</script>

<div class="page" data-testid="ops-page">
  <header>
    <BackLink label="홈" />
    <h1>관리자 <small>운영자</small></h1>
    {#if !forbidden}
      <div class="tabs" role="tablist">
        <button role="tab" class:on={tab === 'accounts'} data-testid="ops-tab-accounts" onclick={() => (tab = 'accounts')}>회원 {#if summary}<small>{summary.total}</small>{/if}</button>
        <button role="tab" class:on={tab === 'content'} data-testid="ops-tab-content" onclick={() => (tab = 'content')}>대화·사용자 신고 {#if content.some((r) => r.status === 'open')}<b class="n">{content.filter((r) => r.status === 'open').length}</b>{/if}</button>
        <button role="tab" class:on={tab === 'members'} data-testid="ops-tab-members" onclick={() => (tab = 'members')}>회원 조치 {#if appeals.some((a) => a.status === 'open')}<b class="n">{appeals.filter((a) => a.status === 'open').length}</b>{/if}</button>
        <button role="tab" class:on={tab === 'bypass'} data-testid="ops-tab-bypass" onclick={() => (tab = 'bypass')}>간판다 밖 거래 신고 {#if bypass.some((r) => r.status === 'open')}<b class="n">{bypass.filter((r) => r.status === 'open').length}</b>{/if}</button>
        <button role="tab" class:on={tab === 'kit'} data-testid="ops-tab-kit" onclick={() => (tab = 'kit')}>채널 키트</button>
      </div>
      {#if tab !== 'accounts'}<div class="filters">
        <button class:on={filter === 'open'} data-testid="ops-filter-open" onclick={() => (filter = 'open')}>처리 대기</button>
        <button class:on={filter === 'all'} data-testid="ops-filter-all" onclick={() => (filter = 'all')}>전체</button>
        <button class="link" onclick={load}>새로고침</button>
      </div>{/if}
    {/if}
  </header>

  {#if forbidden}
    <p class="hint" data-testid="ops-forbidden">운영자만 볼 수 있습니다.</p>
  {:else if !loaded}
    <p class="hint">불러오는 중…</p>
  {:else}
    {#if error}<p class="err">{error}</p>{/if}
    {#if tab === 'accounts'}
      {#if summary}
        <div class="stats" data-testid="ops-summary">
          <span><b>{summary.total}</b>전체</span><span><b>{summary.today}</b>오늘 가입</span><span><b>{summary.week}</b>7일</span>
          <span><b>{summary.shops}</b>간판집</span><span><b>{summary.consumers}</b>가게 사장</span><span><b>{summary.verified}</b>사업자 확인</span>
          <span class:warn={summary.suspended > 0}><b>{summary.suspended}</b>정지</span>
        </div>
      {/if}
      <form class="search" onsubmit={(e) => { e.preventDefault(); void loadAccounts(); }}>
        <input data-testid="ops-accounts-q" bind:value={accQ} placeholder="이메일 · 이름 · 아이디" />
        <select data-testid="ops-accounts-kind" bind:value={accKind} onchange={() => loadAccounts()}>
          <option value="">전체</option><option value="shop">간판집</option><option value="consumer">가게 사장</option><option value="none">종류 미정</option>
        </select>
        <button class="btn small" type="submit">찾기</button>
      </form>
      <div class="table-wrap">
        <table class="acc" data-testid="ops-accounts">
          <thead><tr><th>회원</th><th>종류</th><th>사업자</th><th class="r">프로젝트</th><th>가입</th><th>마지막 접속</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {#each accounts as a (a.id)}
              <tr data-testid="ops-account" data-status={a.status}>
                <td><b>{a.name || '이름 없음'}</b>{#if a.operator} <span class="tag">운영자</span>{/if}<small>{a.email}{a.emailVerified ? '' : ' · 메일 미인증'}</small></td>
                <td>{a.kind ? KIND[a.kind] : '미정'}<small>{a.plan === 'free' ? '무료' : a.plan}</small></td>
                <td>{#if a.business}{a.business.name || '상호 없음'}<small class:bad={a.business.status !== 'active'}>{a.business.status === 'active' ? '계속' : a.business.status === 'suspended' ? '휴업' : a.business.status === 'closed' ? '폐업' : a.business.status}</small>{:else}<span class="muted">-</span>{/if}</td>
                <td class="r">{a.projects}</td>
                <td>{day(a.createdAt)}<small>{a.termsVersion ? `약관 ${a.termsVersion}` : '약관 기록 없음'}</small></td>
                <td>{day(a.lastSeenAt)}</td>
                <td><span class="st" class:open={a.status !== 'active'}>{a.status === 'active' ? '이용 중' : a.status === 'suspended' ? '기간 정지' : '영구 정지'}</span>{#if a.requestsBlocked}<small>요청 받기 정지</small>{/if}</td>
                <td>{#if !a.operator}<button class="btn small" data-testid="ops-account-act" onclick={() => openMember(a.id)}>조치</button>{/if}</td>
              </tr>
            {:else}
              <tr><td colspan="8" class="hint">회원이 없습니다.</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if accNext !== null}<button class="btn small" data-testid="ops-accounts-more" onclick={() => loadAccounts(true)}>더 보기</button>{/if}
    {:else if tab === 'content'}
      <p class="hint">앱스토어 기준: 신고는 24시간 안에 처리합니다. 숨김 = 그 메시지를 프로젝트에서 지웁니다.</p>
      {#each shownContent as r (r.id)}
        <article class="card" class:late={r.status === 'open' && ageH(r.createdAt) > 20} data-testid="ops-report" data-status={r.status}>
          <div class="top">
            <b class="reason">{r.reasonLabel}</b>
            <span class="age" data-testid="ops-age" title={when(r.createdAt)}>{age(r.createdAt)}</span>
            <span class="st" class:open={r.status === 'open'}>{r.status === 'open' ? '처리 대기' : r.action === 'hide' ? '숨김' : '기각'}</span>
          </div>
          <p class="meta">대상 <b>{r.targetName || r.targetId || '-'}</b> · 신고 {r.reporterName || '-'}{#if r.projectId} · 프로젝트 <code>{r.projectId}</code>{/if}</p>
          {#if r.excerpt}<blockquote>{r.excerpt}</blockquote>{/if}
          {#if r.detail}<p class="detail">“{r.detail}”</p>{/if}
          {#if r.status === 'open'}
            <div class="acts">
              {#if r.messageId}<button class="btn small danger" data-testid="ops-hide" disabled={busy === r.id} onclick={() => act(r, 'hide')}>메시지 숨김</button>{/if}
              <button class="btn small" data-testid="ops-dismiss" disabled={busy === r.id} onclick={() => act(r, 'dismiss')}>기각</button>
              {#if r.targetId && !r.targetId.startsWith('g:')}<button class="btn small" data-testid="ops-member-open" onclick={() => openMember(r.targetId!)}>작성자 조치</button>{/if}
            </div>
          {:else if r.resolvedAt}<p class="meta">처리 {when(r.resolvedAt)}</p>{/if}
        </article>
      {:else}
        <p class="hint" data-testid="ops-empty">{filter === 'open' ? '처리 대기 신고가 없습니다.' : '신고가 없습니다.'}</p>
      {/each}
    {:else if tab === 'kit'}
      <KitOpsSection />
    {:else if tab === 'members'}
      <p class="hint">약관 제5조의2: 경고 → 기간 정지 → 영구 정지(이용계약 해지). 조치하면 회원에게 사유와 이의 신청(14일) 안내를 이메일로 보냅니다.</p>
      {#if appeals.some((a) => filter === 'all' || a.status === 'open')}
        <h2 class="sub">이의 신청</h2>
        {#each appeals.filter((a) => filter === 'all' || a.status === 'open') as a (a.id)}
          <article class="card" data-testid="ops-appeal" data-status={a.status}>
            <div class="top"><b class="reason">{a.name || a.email}</b><span class="age" title={when(a.createdAt)}>{age(a.createdAt)}</span><span class="st" class:open={a.status === 'open'}>{a.status === 'open' ? '처리 대기' : a.status === 'accepted' ? '인정(해제)' : '기각'}</span></div>
            <p class="meta">{a.email}</p>
            <blockquote>{a.text}</blockquote>
            {#if a.reply}<p class="detail">답: {a.reply}</p>{/if}
            {#if a.status === 'open'}<div class="acts"><button class="btn small primary" data-testid="ops-appeal-accept" disabled={busy === a.id} onclick={() => decide(a, 'accept')}>받아들이기(해제)</button><button class="btn small" data-testid="ops-appeal-reject" disabled={busy === a.id} onclick={() => decide(a, 'reject')}>기각</button><button class="btn small" onclick={() => openMember(a.accountId)}>회원 보기</button></div>{/if}
          </article>
        {/each}
      {/if}
      <h2 class="sub">회원 찾기</h2>
      <form class="search" onsubmit={(e) => { e.preventDefault(); void search(); }}>
        <input data-testid="ops-member-q" bind:value={q} placeholder="이메일 · 이름 · 아이디 (비우면 정지된 회원)" />
        <button class="btn small" data-testid="ops-member-search" type="submit">찾기</button>
      </form>
      {#each members as m (m.id)}
        <article class="card" data-testid="ops-member" data-status={m.status}>
          <div class="top"><b class="reason">{m.name || m.email}</b><span class="st" class:open={m.status !== 'active'} data-testid="ops-member-status">{STATUS[m.status]}{m.status === 'suspended' && m.until ? ` · ${when(m.until)}까지` : ''}</span></div>
          <p class="meta">{m.email} · 가입 {when(m.createdAt)}{m.requestsBlocked ? ' · 요청 받기 정지' : ''}{m.reason ? ` · 사유: ${m.reason}` : ''}</p>
          {#if m.actions.length}<ul class="hist">{#each m.actions as h, k (k)}<li>{when(h.at)} <b>{ACTION[h.action]}</b>{h.until ? ` (${when(h.until)}까지)` : ''}{h.reason ? ` — ${h.reason}` : ''} <small>{h.by}</small></li>{/each}</ul>{/if}
          <div class="acts">
            <button class="btn small" data-testid="ops-member-warn" disabled={busy === m.id} onclick={() => memberAct(m, 'warn')}>경고</button>
            <button class="btn small" data-testid="ops-member-suspend7" disabled={busy === m.id} onclick={() => memberAct(m, 'suspend', 7)}>7일 정지</button>
            <button class="btn small" data-testid="ops-member-suspend30" disabled={busy === m.id} onclick={() => memberAct(m, 'suspend', 30)}>30일 정지</button>
            <button class="btn small danger" data-testid="ops-member-ban" disabled={busy === m.id} onclick={() => memberAct(m, 'ban')}>영구 정지</button>
            {#if m.status !== 'active'}<button class="btn small primary" data-testid="ops-member-lift" disabled={busy === m.id} onclick={() => memberAct(m, 'lift')}>해제</button>{/if}
          </div>
        </article>
      {:else}
        {#if searched}<p class="hint">찾은 회원이 없습니다.</p>{/if}
      {/each}
    {:else}
      <p class="hint">가게 사장님이 "간판다 밖에서 진행했다"고 알린 신고. 요청을 열람한 간판집 중 확인된 곳에 위약금(크레딧 3배·최대 15만원) + 요청 받기 정지.</p>
      {#each shownBypass as r (r.id)}
        <article class="card" data-testid="ops-bypass" data-status={r.status}>
          <div class="top">
            <b class="reason">{r.request ? `${r.request.store} · ${r.request.region}${r.request.floor ? ` ${r.request.floor}` : ''}` : r.requestId}</b>
            <span class="age" title={when(r.createdAt)}>{age(r.createdAt)}</span>
            <span class="st" class:open={r.status === 'open'}>{r.status === 'open' ? '처리 대기' : r.status === 'penalized' ? `위약금 ${won(r.amount ?? 0)}` : '기각'}</span>
          </div>
          <p class="meta">신고된 업체 <b>{r.shop}</b>{#if r.text} · “{r.text}”{/if}</p>
          <ul class="viewers">
            {#each r.viewers as v (v.accountId)}
              <li>
                <span>{v.business ?? v.name ?? v.email} <small>{v.email}{v.bizNo ? ` · ${v.bizNo}` : ''} · 열람 {when(v.firstAt)}{v.paid ? ' · 크레딧 결제' : ''}</small></span>
                {#if r.status === 'open'}<button class="btn small danger" data-testid="ops-penalize" disabled={busy === r.id} onclick={() => penalize(r, v.accountId, v.business ?? v.email)}>위약금 {won(r.penalty)}</button>{/if}
                {#if v.blocked}<button class="btn small" data-testid="ops-unblock" disabled={busy === v.accountId} onclick={() => unblock(v.accountId)}>정지 풀기</button>{/if}
              </li>
            {:else}<li class="hint">요청을 열람한 간판집이 없습니다.</li>{/each}
          </ul>
          {#if r.status === 'open'}<div class="acts"><button class="btn small" data-testid="ops-bypass-dismiss" disabled={busy === r.id} onclick={() => dismissBypass(r)}>기각</button></div>{/if}
        </article>
      {:else}
        <p class="hint">{filter === 'open' ? '처리 대기 신고가 없습니다.' : '신고가 없습니다.'}</p>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .page { max-width: 1040px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  header { display: flex; flex-direction: column; gap: 8px; }
  h1 { margin: 0; font-size: 20px; }
  h1 small { font-size: 12px; color: var(--accent); margin-left: 6px; }
  .tabs, .filters { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .tabs button, .filters button:not(.link) { background: none; border: 1px solid var(--line); color: var(--muted); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; }
  .tabs button.on, .filters button.on { color: var(--text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .n { background: #ef4444; color: #fff; border-radius: 9px; padding: 0 6px; font-size: 11px; margin-left: 4px; }
  .card { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: var(--panel); display: flex; flex-direction: column; gap: 6px; }
  .card.late { border-color: #ef4444; }
  .card[data-status='resolved'], .card[data-status='dismissed'], .card[data-status='penalized'] { opacity: 0.7; }
  .top { display: flex; align-items: center; gap: 8px; }
  .reason { flex: 1; min-width: 0; }
  .age { font-size: 12px; color: var(--muted); }
  .late .age { color: #f87171; font-weight: 700; }
  .st { font-size: 11px; font-weight: 700; border-radius: 8px; padding: 1px 8px; background: color-mix(in srgb, var(--text) 10%, transparent); }
  .st.open { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
  .meta { margin: 0; font-size: 12px; color: var(--muted); }
  code { font-size: 11px; }
  blockquote { margin: 0; padding: 8px 10px; border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--text) 5%, transparent); border-radius: 0 8px 8px 0; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
  .detail { margin: 0; font-size: 13px; }
  .acts { display: flex; gap: 6px; justify-content: flex-end; }
  .viewers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .viewers li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .viewers li span { flex: 1; min-width: 0; }
  .viewers small { display: block; color: var(--muted); font-size: 11px; }
  .hint { color: var(--muted); font-size: 13px; margin: 0; }
  .sub { margin: 8px 0 0; font-size: 15px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; }
  .stats span { display: flex; flex-direction: column; align-items: center; min-width: 76px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); font-size: 12px; color: var(--muted); }
  .stats b { font-size: 18px; color: var(--text); }
  .stats .warn b { color: #f87171; }
  .search select { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 0 8px; font: inherit; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
  table.acc { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 760px; }
  .acc th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--line); background: var(--panel); }
  .acc td { padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .acc td small { display: block; color: var(--muted); font-size: 11px; }
  .acc td small.bad { color: #f87171; }
  .acc .r { text-align: right; }
  .acc tr[data-status='suspended'], .acc tr[data-status='banned'] { background: rgba(239, 68, 68, 0.06); }
  .tag { font-size: 10px; padding: 0 6px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .muted { color: var(--muted); }
  .search { display: flex; gap: 6px; }
  .search input { flex: 1; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 8px 10px; font: inherit; }
  .hist { margin: 0; padding-left: 18px; font-size: 12px; color: var(--muted); display: flex; flex-direction: column; gap: 2px; }
  .hist b { color: var(--text); }
  .err { color: #f87171; font-size: 13px; margin: 0; }
</style>
