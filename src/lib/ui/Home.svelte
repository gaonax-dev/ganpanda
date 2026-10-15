<!--
  홈: 로그인하면 내 프로젝트 + 프로젝트 그룹(계산서를 그룹에서 한번에), 아니면 로그인 안내.
  2026-10-15 사용자: "프로젝트 그룹을 만들고 계산서를 그룹에서 한번에, 세부사항은 프로젝트 리스트뷰로, 상태 대기/진행중/완료,
  정산은 받은 금액/계약 금액, 다 받으면 총금액만. 해당 내역은 오너는 기본으로, 멤버는 오너가 설정해 준다"
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { addGroupMember, createGroup, createProject, deleteGroup, getGroup, listGroups, listProjects, removeGroupMember, setGroupMember, updateProject, STATUS_LABEL, type GroupInfo, type GroupView, type ProjectInfo, type ProjectStatus } from '../projects';
  import { won } from '../core/quote';

  let projects = $state<ProjectInfo[] | null>(null);
  let groups = $state<GroupInfo[]>([]);
  /** 펼친 그룹의 상세 (프로젝트·멤버) */
  let views = $state<Record<string, GroupView>>({});
  let name = $state('');
  let groupName = $state('');
  let memberEmail = $state<Record<string, string>>({});
  let busy = $state(false);

  async function reload() {
    try {
      [projects, groups] = await Promise.all([listProjects(), listGroups()]);
      for (const g of groups) views[g.id] = await getGroup(g.id);
    } catch { projects ??= []; }
  }
  $effect(() => {
    if (app.account) reload();
    else { projects = null; groups = []; views = {}; }
  });

  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    try {
      const p = await createProject(n);
      location.href = `/?room=${p.id}`;
    } finally { busy = false; }
  }
  async function makeGroup() {
    const n = groupName.trim();
    if (!n || busy) return;
    busy = true;
    try { await createGroup(n); groupName = ''; await reload(); } finally { busy = false; }
  }
  async function patch(id: string, body: Parameters<typeof updateProject>[1]) {
    await updateProject(id, body);
    await reload();
  }
  const date = (ts: number) => new Date(ts).toLocaleDateString('ko-KR');
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  /** 정산 표시: 다 받았으면 총금액만, 아니면 받은/계약 */
  const settle = (p: { contractAmount?: number; paidAmount?: number }) => {
    const c = p.contractAmount ?? 0, r = p.paidAmount ?? 0;
    if (c > 0 && r >= c) return `총 ${won(c)}`;
    return `${won(r)} / ${won(c)}`;
  };
  const paidUp = (p: { contractAmount?: number; paidAmount?: number }) => (p.contractAmount ?? 0) > 0 && (p.paidAmount ?? 0) >= (p.contractAmount ?? 0);
  const totals = (ps: { contractAmount?: number; paidAmount?: number }[]) => {
    const c = ps.reduce((a, p) => a + (p.contractAmount ?? 0), 0), r = ps.reduce((a, p) => a + (p.paidAmount ?? 0), 0);
    return { c, r, due: Math.max(0, c - r) };
  };
  const ungrouped = $derived((projects ?? []).filter((p) => !p.groupId));
</script>

<div class="home">
  {#if !app.authReady}
    <p class="hint">확인 중…</p>
  {:else if app.account}
    <section data-testid="project-list">
      <h1>내 프로젝트</h1>
      <form class="new" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <input data-testid="new-project-name" placeholder="새 프로젝트 이름 (예: 간판다 카페)" bind:value={name} />
        <button class="btn primary" data-testid="new-project-submit" type="submit" disabled={busy || !name.trim()}>만들기</button>
      </form>
      <form class="new" onsubmit={(e) => { e.preventDefault(); makeGroup(); }}>
        <input data-testid="new-group-name" placeholder="새 그룹 이름 (예: 2026 하반기, ○○건설 발주)" bind:value={groupName} />
        <button class="btn" data-testid="new-group-submit" type="submit" disabled={busy || !groupName.trim()}>그룹 만들기</button>
      </form>

      {#each groups as g (g.id)}
        {@const v = views[g.id]}
        <article class="group" data-testid="group" data-id={g.id}>
          <header>
            <h2>{g.name} <small>{g.role === 'owner' ? '오너' : g.canBilling ? '멤버 · 정산 보기' : '멤버'}</small></h2>
            {#if g.role === 'owner'}<button class="icon" title="그룹 삭제 (프로젝트는 남고 그룹에서만 빠짐)" data-testid="group-delete" onclick={async () => { if (confirm(`"${g.name}" 그룹을 지울까요? 프로젝트는 남습니다.`)) { await deleteGroup(g.id); await reload(); } }}>✕</button>{/if}
          </header>
          {#if v}
            <table>
              <thead><tr><th>프로젝트</th><th>상태</th>{#if g.canBilling}<th class="r">정산 (받은 / 계약)</th>{/if}</tr></thead>
              <tbody>
                {#each v.projects as p (p.id)}
                  <tr data-testid="group-project" data-status={p.status} class:paid={paidUp(p)}>
                    <td><a href="/?room={p.id}&view=list" title="세부 내역은 프로젝트의 리스트 뷰(견적)에서">{p.name}</a><small>{date(p.createdAt)}</small></td>
                    <td>
                      {#if g.role === 'owner'}
                        <select data-testid="project-status" value={p.status} onchange={(e) => patch(p.id, { status: e.currentTarget.value as ProjectStatus })}>
                          {#each Object.entries(STATUS_LABEL) as [k, label] (k)}<option value={k}>{label}</option>{/each}
                        </select>
                      {:else}<span class="status" data-status={p.status}>{STATUS_LABEL[p.status]}</span>{/if}
                    </td>
                    {#if g.canBilling}
                      <td class="r">
                        {#if g.role === 'owner'}
                          <span class="amounts">
                            <input data-testid="paid-amount" type="number" min="0" step="10000" value={p.paidAmount ?? 0} onchange={(e) => patch(p.id, { paidAmount: num(e.currentTarget.value) })} />
                            <span>/</span>
                            <input data-testid="contract-amount" type="number" min="0" step="10000" value={p.contractAmount ?? 0} onchange={(e) => patch(p.id, { contractAmount: num(e.currentTarget.value) })} />
                          </span>
                        {/if}
                        <b data-testid="settle">{settle(p)}</b>
                      </td>
                    {/if}
                  </tr>
                {:else}
                  <tr><td colspan="3" class="hint">아직 프로젝트가 없습니다. 아래 목록에서 프로젝트를 이 그룹에 넣으세요.</td></tr>
                {/each}
              </tbody>
              {#if g.canBilling && v.projects.length}
                {@const t = totals(v.projects)}
                <tfoot><tr data-testid="group-totals"><td>계산서 합계 · {v.projects.length}건</td><td>미수 {won(t.due)}</td><td class="r"><b>{t.r >= t.c && t.c > 0 ? `총 ${won(t.c)}` : `${won(t.r)} / ${won(t.c)}`}</b></td></tr></tfoot>
              {/if}
            </table>
            {#if g.role === 'owner'}
              <div class="members">
                <span class="label">멤버</span>
                {#each v.members ?? [] as m (m.accountId)}
                  <span class="member" data-testid="group-member">{m.name || m.email}
                    <label class="chk"><input type="checkbox" data-testid="member-billing" checked={m.canBilling} onchange={async (e) => { await setGroupMember(g.id, m.accountId, e.currentTarget.checked); await reload(); }} /> 정산 보기</label>
                    <button class="icon" title="멤버 제거" onclick={async () => { await removeGroupMember(g.id, m.accountId); await reload(); }}>✕</button>
                  </span>
                {/each}
                <form class="add" onsubmit={async (e) => { e.preventDefault(); const em = (memberEmail[g.id] ?? '').trim(); if (!em) return; try { await addGroupMember(g.id, em, false); memberEmail[g.id] = ''; await reload(); } catch { app.notice = '그 이메일로 가입한 계정이 없습니다. 먼저 로그인해 계정을 만들게 해 주세요.'; } }}>
                  <input data-testid="member-email" placeholder="멤버 이메일 (가입된 계정)" value={memberEmail[g.id] ?? ''} oninput={(e) => (memberEmail[g.id] = e.currentTarget.value)} />
                  <button class="btn small" data-testid="member-add" type="submit">추가</button>
                </form>
              </div>
            {/if}
          {:else}<p class="hint">불러오는 중…</p>{/if}
        </article>
      {/each}

      {#if projects === null}
        <p class="hint">불러오는 중…</p>
      {:else if !projects.length}
        <p class="hint">아직 프로젝트가 없습니다. 매장 이름으로 첫 프로젝트를 만들어 보세요.</p>
      {:else if ungrouped.length}
        <h2 class="sub">{groups.length ? '그룹 없는 프로젝트' : '프로젝트'}</h2>
        <ul>
          {#each ungrouped as p (p.id)}
            <li>
              <a data-testid="project-item" href="/?room={p.id}"><b>{p.name}</b><small>{STATUS_LABEL[p.status]} · {date(p.createdAt)}</small></a>
              {#if groups.some((g) => g.role === 'owner')}
                <select class="assign" data-testid="project-group" value="" onchange={(e) => { const id = e.currentTarget.value; if (id) patch(p.id, { groupId: id }); }}>
                  <option value="">그룹에 넣기…</option>
                  {#each groups.filter((g) => g.role === 'owner') as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
                </select>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <section class="landing">
      <h1>간판다</h1>
      <p>건물 사진 위에서 사인물을 함께 정하고 견적까지. 제작자는 로그인해 프로젝트를 만들고, 고객은 초대 링크로 들어옵니다.</p>
      <button class="btn primary" onclick={() => (app.loginOpen = true)}>이메일로 로그인</button>
    </section>
  {/if}
</div>

<style>
  .home { position: absolute; inset: 0; overflow-y: auto; display: flex; justify-content: center; padding: 48px 16px; }
  section { width: min(760px, 100%); }
  h1 { font-size: 22px; margin: 0 0 16px; }
  h2.sub { font-size: 14px; color: var(--muted); margin: 18px 0 8px; }
  .new { display: flex; gap: 8px; margin-bottom: 10px; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  li { display: flex; gap: 8px; align-items: center; }
  li a { flex: 1; display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); text-decoration: none; background: var(--panel); }
  li a:hover { border-color: var(--accent); }
  li small { color: var(--muted); }
  .assign { width: 150px; }
  .group { margin: 14px 0; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
  .group header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .group h2 { margin: 0; font-size: 16px; }
  .group h2 small { color: var(--muted); font-size: 11px; font-weight: 400; margin-left: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 11px; padding: 4px 6px; border-bottom: 1px solid var(--line); }
  td { padding: 7px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  td a { color: var(--text); text-decoration: none; font-weight: 600; }
  td a:hover { color: var(--accent); }
  td small { display: block; color: var(--muted); font-size: 11px; }
  .r { text-align: right; }
  .amounts { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; }
  .amounts input { width: 110px; text-align: right; padding: 4px 6px; font-size: 12px; }
  tr.paid b { color: var(--ok); }
  .status[data-status='ongoing'] { color: var(--accent); }
  .status[data-status='done'] { color: var(--ok); }
  .status[data-status='waiting'] { color: var(--muted); }
  select { width: auto; padding: 4px 6px; font-size: 12px; }
  tfoot td { border-bottom: 0; padding-top: 10px; font-weight: 600; }
  .members { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; }
  .members .label { color: var(--muted); }
  .member { display: inline-flex; align-items: center; gap: 6px; background: var(--input); border: 1px solid var(--line); border-radius: 12px; padding: 2px 4px 2px 10px; }
  .chk { flex-direction: row; align-items: center; gap: 4px; font-size: 11px; }
  .members .add { display: flex; gap: 6px; margin-left: auto; }
  .members .add input { width: 220px; padding: 5px 8px; font-size: 12px; }
  .landing { text-align: center; margin-top: 60px; }
  .landing p { color: var(--muted); line-height: 1.6; margin-bottom: 20px; }
  @media (max-width: 720px) {
    .amounts { display: flex; margin: 0 0 4px; }
    .amounts input { width: 90px; }
    .members .add { margin-left: 0; }
    .members .add input { width: 160px; }
  }
</style>
