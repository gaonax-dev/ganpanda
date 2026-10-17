<!--
  홈: 내 프로젝트 카드 + 프로젝트 그룹.
  2026-10-15 사용자: "프로젝트를 시프트 키 상태에서 두 개를 잡고 오른쪽 마우스로 그룹 만들기. 리스트 뷰의 계산값이 계약 금액. 입금액은 표시를 클릭하면
  입력란, 계약 금액도 사용자가 입력하면 그 금액이 표시되고 자동 계산 복구 버튼. 그룹은 두 프로젝트가 겹쳐진 것같이 표시, 클릭 시 폴딩.
  그룹을 클릭하면 전체 정보·비용 계산서. 멤버 관리는 설정에서."
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { createGroup, createProject, deleteGroup, deleteProject, getGroup, listGroups, listProjects, updateProject, STATUS_LABEL, type GroupInfo, type GroupView, type ProjectInfo, type ProjectStatus } from '../projects';
  import { won } from '../core/quote';
  import { listRequests, respondRequest, shopPhotoUrl, type ShopRequest } from '../requests';

  let projects = $state<ProjectInfo[] | null>(null);
  let groups = $state<GroupInfo[]>([]);
  let views = $state<Record<string, GroupView>>({});
  let name = $state('');
  let busy = $state(false);
  /** 선택 모드(상단 ○ 선택 토글): 카드를 누르면 고르고, 하단 탭에 그룹·삭제 (2026-10-15 사용자: "시프트 대신 상단에 선택 버튼으로 토글하면 하단 탭에 기능 버튼 그룹, 삭제") */
  let selectMode = $state(false);
  let selected = $state<Set<string>>(new Set());
  /** 하단 탭의 그룹 이름 입력 */
  let naming = $state(false);
  let groupName = $state('');
  /** 펼친 그룹 */
  let open = $state<Set<string>>(new Set());
  /** 클릭해 입력 중인 금액 칸 */
  let editing = $state<{ id: string; field: 'paid' | 'contract' } | null>(null);

  /** 받은 요청 (요청판, 2026-10-17): 요청 받기를 켰거나 답한 요청이 있을 때 */
  let requests = $state<ShopRequest[]>([]);
  let responding = $state('');
  async function respond(r: ShopRequest) {
    if (responding) return;
    responding = r.id;
    try { const p = await respondRequest(r.id); location.href = `/?room=${p.id}`; }
    catch (e) { app.notice = e instanceof Error ? e.message : String(e); responding = ''; }
  }
  async function reload() {
    try {
      [projects, groups] = await Promise.all([listProjects(), listGroups()]);
      if (app.requestsEnabled) listRequests().then((rs) => (requests = rs)).catch(() => (requests = []));
      const next: Record<string, GroupView> = {};
      await Promise.all(groups.map(async (g) => { next[g.id] = await getGroup(g.id); }));
      views = next;
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
    try { const p = await createProject(n); location.href = `/?room=${p.id}`; } finally { busy = false; }
  }
  const ungrouped = $derived((projects ?? []).filter((p) => !p.groupId));

  // ---------- 선택 모드 ----------
  function toggleSelectMode() { selectMode = !selectMode; selected = new Set(); naming = false; }
  function toggle(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    selected = s;
  }
  function clickCard(e: MouseEvent, id: string) {
    if (!selectMode) return; // 보통 클릭 = 링크로 이동
    e.preventDefault();
    toggle(id);
  }
  async function makeGroup() {
    const n = groupName.trim();
    if (!n || busy) return;
    busy = true;
    try {
      const g = await createGroup(n, [...selected]);
      selected = new Set(); naming = false; groupName = ''; selectMode = false;
      await reload();
      open = new Set([...open, g.id]);
    } finally { busy = false; }
  }
  async function addToGroup(groupId: string) {
    const ids = [...selected];
    selected = new Set(); selectMode = false;
    for (const id of ids) await updateProject(id, { groupId });
    await reload();
    open = new Set([...open, groupId]);
  }
  async function ungroup() {
    const ids = [...selected];
    selected = new Set(); selectMode = false;
    for (const id of ids) await updateProject(id, { groupId: null });
    await reload();
  }
  async function removeSelected() {
    const ids = [...selected];
    const names = ids.map((id) => projects?.find((p) => p.id === id)?.name ?? id);
    if (!confirm(`프로젝트 ${ids.length}개를 삭제할까요?\n${names.join(', ')}\n사진·사인물·대화가 모두 지워지고 되돌릴 수 없습니다.`)) return;
    selected = new Set(); selectMode = false;
    for (const id of ids) await deleteProject(id);
    await reload();
  }
  const selectedGrouped = $derived([...selected].some((id) => projects?.find((p) => p.id === id)?.groupId));
  async function removeGroup(g: GroupInfo) {
    if (!confirm(`"${g.name}" 그룹을 지울까요? 프로젝트는 남습니다.`)) return;
    await deleteGroup(g.id);
    await reload();
  }
  function toggleGroup(id: string) {
    const s = new Set(open);
    if (s.has(id)) s.delete(id); else s.add(id);
    open = s;
  }

  // ---------- 정산 ----------
  async function patch(id: string, body: Parameters<typeof updateProject>[1]) {
    await updateProject(id, body);
    await reload();
  }
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  const paidUp = (p: ProjectInfo) => (p.contractAmount ?? 0) > 0 && (p.paidAmount ?? 0) >= (p.contractAmount ?? 0);
  const totals = (ps: ProjectInfo[]) => {
    const c = ps.reduce((a, p) => a + (p.contractAmount ?? 0), 0), r = ps.reduce((a, p) => a + (p.paidAmount ?? 0), 0);
    return { c, r, due: Math.max(0, c - r), allPaid: c > 0 && r >= c };
  };
  async function commitAmount(p: ProjectInfo, field: 'paid' | 'contract', value: string) {
    editing = null;
    const v = num(value);
    if (field === 'paid') { if (v !== (p.paidAmount ?? 0)) await patch(p.id, { paidAmount: v }); }
    else if (v !== (p.contractAmount ?? 0) || p.contractAuto) await patch(p.id, { contractAmount: v });
  }
  const date = (ts: number) => new Date(ts).toLocaleDateString('ko-KR');
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { if (selectMode) toggleSelectMode(); editing = null; } }} />

<div class="home">
  {#if !app.authReady}
    <p class="hint">확인 중…</p>
  {:else if app.account}
    {#if app.requestsEnabled && (requests.length || app.requestSettings?.receive)}
      <section class="requests" data-testid="request-list">
        <h1>받은 요청 <small>{app.requestSettings?.regions.join(', ') || '지역을 설정하세요'} · <button class="link" onclick={() => (app.settingsOpen = true)}>설정</button></small></h1>
        {#each requests as r (r.id)}
          <div class="rcard" data-testid="request-item" data-status={r.status} data-responded={r.responded}>
            <div class="rphotos">{#each r.photos as p (p.n)}<img src={shopPhotoUrl(r.id, p.n)} alt="" />{/each}</div>
            <div class="rbody">
              <b>{r.store}</b> <span class="muted">{r.region} · {date(r.createdAt)}{r.status === 'approved' ? ' · 승인됨' : ''}</span>
              {#if r.text}<p>{r.text}</p>{/if}
              {#if r.responded}
                <p data-testid="request-phone">📞 {r.phone}{r.email ? ` · ${r.email}` : ''} <span class="muted">— 제안을 보냈습니다</span></p>
              {:else}
                <p class="muted">제안 링크를 보내면 연락처가 보입니다.</p>
              {/if}
              {#if r.projectId}
                <a class="btn small" data-testid="request-open" href="/?room={r.projectId}">프로젝트 열기</a>
              {:else}
                <button class="btn small primary" data-testid="request-respond" disabled={responding === r.id} onclick={() => respond(r)}>제안 만들기</button>
              {/if}
            </div>
          </div>
        {:else}
          <p class="hint">아직 이 지역의 요청이 없습니다.</p>
        {/each}
      </section>
    {/if}
    <section data-testid="project-list">
      <h1>내 프로젝트</h1>
      <form class="new" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <input data-testid="new-project-name" placeholder="새 프로젝트 이름 (예: 간판다 카페)" bind:value={name} />
        <button class="btn primary" data-testid="new-project-submit" type="submit" disabled={busy || !name.trim()}>만들기</button>
        {#if projects?.length}<button class="btn" type="button" class:on={selectMode} data-testid="select-mode" title="프로젝트를 골라 그룹으로 묶거나 삭제" onclick={toggleSelectMode}>{selectMode ? '◉ 선택 중' : '○ 선택'}</button>{/if}
      </form>
      {#if selectMode}<p class="hint">카드를 눌러 고르세요. 아래 탭에서 그룹으로 묶거나 삭제합니다.</p>{/if}

      <div class="grid">
        <!-- 그룹: 카드 두 장이 겹친 모양. 누르면 펼침/접힘 -->
        {#each groups as g (g.id)}
          {@const v = views[g.id]}
          {@const t = v ? totals(v.projects) : null}
          <div class="gwrap" class:open={open.has(g.id)}>
            <button class="gcard" data-testid="group" data-id={g.id} data-open={open.has(g.id)} onclick={() => toggleGroup(g.id)} title="누르면 계산서를 펼치거나 접습니다">
              <span class="stack"></span><span class="stack s2"></span>
              <span class="face">
                <b>{g.name}</b>
                <small>{v ? `프로젝트 ${v.projects.length}개` : '…'}{g.role === 'member' ? ' · 멤버' : ''}</small>
                {#if t && g.canBilling && v?.projects.length}<small class="sum" data-testid="group-summary">{t.allPaid ? `총 ${won(t.c)}` : `미수 ${won(t.due)}`}</small>{/if}
              </span>
            </button>
            {#if open.has(g.id) && v}
              <div class="bill" data-testid="group-bill">
                <table>
                  <thead><tr><th>프로젝트</th><th>상태</th>{#if g.canBilling}<th class="r">받은 금액 / 계약 금액</th>{/if}</tr></thead>
                  <tbody>
                    {#each v.projects as p (p.id)}
                      <tr data-testid="group-project" data-status={p.status} class:paid={paidUp(p)} class:sel={selected.has(p.id)}>
                        <td>{#if selectMode && g.role === 'owner'}<input type="checkbox" data-testid="row-select" checked={selected.has(p.id)} onchange={() => toggle(p.id)} /> {/if}<a href="/?room={p.id}&view=list" title="세부 내역은 프로젝트의 리스트 뷰(견적)에서">{p.name}</a><small>{date(p.createdAt)}</small></td>
                        <td>
                          {#if g.role === 'owner'}
                            <select data-testid="project-status" value={p.status} onchange={(e) => patch(p.id, { status: e.currentTarget.value as ProjectStatus })}>
                              {#each Object.entries(STATUS_LABEL) as [k, label] (k)}<option value={k}>{label}</option>{/each}
                            </select>
                          {:else}<span class="status" data-status={p.status}>{STATUS_LABEL[p.status]}</span>{/if}
                        </td>
                        {#if g.canBilling}
                          <td class="r amounts">
                            {#if paidUp(p) && editing?.id !== p.id}
                              <!-- 다 받았으면 총금액만 (누르면 받은 금액 수정) -->
                              <button class="amt total" data-testid="settle" disabled={g.role !== 'owner'} onclick={() => (editing = { id: p.id, field: 'paid' })}>총 {won(p.contractAmount ?? 0)}</button>
                            {:else}
                              {#if editing?.id === p.id && editing.field === 'paid'}
                                <!-- svelte-ignore a11y_autofocus -->
                                <input data-testid="paid-input" type="number" min="0" step="10000" value={p.paidAmount ?? 0} autofocus onkeydown={(e) => { if (e.key === 'Enter') commitAmount(p, 'paid', e.currentTarget.value); if (e.key === 'Escape') editing = null; }} onblur={(e) => commitAmount(p, 'paid', e.currentTarget.value)} />
                              {:else}
                                <button class="amt" data-testid="paid" disabled={g.role !== 'owner'} title="누르면 입금액 입력" onclick={() => (editing = { id: p.id, field: 'paid' })}>{won(p.paidAmount ?? 0)}</button>
                              {/if}
                              <span>/</span>
                              {#if editing?.id === p.id && editing.field === 'contract'}
                                <!-- svelte-ignore a11y_autofocus -->
                                <input data-testid="contract-input" type="number" min="0" step="10000" value={p.contractAmount ?? 0} autofocus onkeydown={(e) => { if (e.key === 'Enter') commitAmount(p, 'contract', e.currentTarget.value); if (e.key === 'Escape') editing = null; }} onblur={(e) => commitAmount(p, 'contract', e.currentTarget.value)} />
                              {:else}
                                <button class="amt" data-testid="contract" data-auto={p.contractAuto} disabled={g.role !== 'owner'} title={p.contractAuto ? '리스트 뷰 견적 합계 (자동). 누르면 직접 입력' : '직접 입력한 계약 금액'} onclick={() => (editing = { id: p.id, field: 'contract' })}>{won(p.contractAmount ?? 0)}{#if p.contractAuto}<i>자동</i>{/if}</button>
                              {/if}
                              {#if !p.contractAuto && g.role === 'owner'}<button class="link" data-testid="contract-auto" title="리스트 뷰 견적 합계로 되돌림" onmousedown={(e) => e.preventDefault()} onclick={() => { editing = null; patch(p.id, { contractAmount: null }); }}>자동 계산 복구</button>{/if}
                            {/if}
                          </td>
                        {/if}
                      </tr>
                    {:else}
                      <tr><td colspan="3" class="hint">프로젝트가 없습니다. 프로젝트 카드를 Shift 로 고르고 오른쪽 클릭 → 그룹에 넣기.</td></tr>
                    {/each}
                  </tbody>
                  {#if g.canBilling && v.projects.length && t}
                    <tfoot><tr data-testid="group-totals"><td>계산서 · {v.projects.length}건</td><td>미수 {won(t.due)}</td><td class="r"><b>{t.allPaid ? `총 ${won(t.c)}` : `${won(t.r)} / ${won(t.c)}`}</b></td></tr></tfoot>
                  {/if}
                </table>
                {#if g.role === 'owner'}<div class="gactions"><button class="link" data-testid="group-delete" onclick={() => removeGroup(g)}>그룹 삭제 (프로젝트는 남음)</button></div>{/if}
              </div>
            {/if}
          </div>
        {/each}

        <!-- 프로젝트 카드 (그룹 밖) -->
        {#each ungrouped as p (p.id)}
          <a class="pcard" data-testid="project-item" data-id={p.id} class:sel={selected.has(p.id)} class:picking={selectMode} href="/?room={p.id}" onclick={(e) => clickCard(e, p.id)}>
            {#if selectMode}<span class="pick" aria-hidden="true">{selected.has(p.id) ? '◉' : '○'}</span>{/if}
            <b>{p.name}</b>
            <small><span class="status" data-status={p.status}>{STATUS_LABEL[p.status]}</span> · {date(p.createdAt)}</small>
          </a>
        {/each}
      </div>
      {#if projects === null}<p class="hint">불러오는 중…</p>
      {:else if !projects.length}<p class="hint">아직 프로젝트가 없습니다. 매장 이름으로 첫 프로젝트를 만들어 보세요.</p>{/if}
    </section>
  {:else}
    <section class="landing">
      <h1>간판다</h1>
      <p>건물 사진 위에서 사인물을 함께 정하고 견적까지. 제작자는 로그인해 프로젝트를 만들고, 고객은 초대 링크로 들어옵니다.</p>
      <button class="btn primary" onclick={() => (app.loginOpen = true)}>로그인 · 회원가입</button>
    </section>
  {/if}
</div>

{#if selectMode}
  <div class="bar" data-testid="select-bar">
    <span class="count">{selected.size}개 선택</span>
    {#if naming}
      <form onsubmit={(e) => { e.preventDefault(); makeGroup(); }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input data-testid="group-name" placeholder="그룹 이름" bind:value={groupName} autofocus />
        <button class="btn small primary" data-testid="group-create" type="submit" disabled={!groupName.trim() || busy}>만들기</button>
        <button class="btn small" type="button" onclick={() => (naming = false)}>취소</button>
      </form>
    {:else}
      <button class="btn small primary" data-testid="bar-group" disabled={!selected.size} onclick={() => (naming = true)}>그룹</button>
      {#if groups.some((g) => g.role === 'owner')}
        <select data-testid="bar-add-to-group" value="" disabled={!selected.size} onchange={(e) => { const id = e.currentTarget.value; if (id) addToGroup(id); }}>
          <option value="">기존 그룹에 넣기…</option>
          {#each groups.filter((g) => g.role === 'owner') as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
        </select>
      {/if}
      {#if selectedGrouped}<button class="btn small" data-testid="bar-ungroup" onclick={ungroup}>그룹에서 빼기</button>{/if}
      <button class="btn small danger" data-testid="bar-delete" disabled={!selected.size} onclick={removeSelected}>삭제</button>
      <button class="btn small" data-testid="bar-cancel" onclick={toggleSelectMode}>취소</button>
    {/if}
  </div>
{/if}

<style>
  .requests h1 small { font-size: 12px; font-weight: 400; color: var(--muted); margin-left: 8px; }
  .link { background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0; font-size: 12px; }
  .rcard { display: flex; gap: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin: 8px 0; }
  .rphotos { display: flex; gap: 4px; flex-shrink: 0; }
  .rphotos img { width: 96px; height: 72px; object-fit: cover; border-radius: 6px; }
  .rbody { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .rbody p { margin: 0; }
  .rbody .muted { color: var(--muted); }
  .rbody .btn { align-self: flex-start; margin-top: 4px; }
  .home { position: absolute; inset: 0; overflow-y: auto; display: flex; justify-content: center; padding: 40px 16px 90px; }
  section { width: min(900px, 100%); }
  h1 { font-size: 22px; margin: 0 0 14px; }
  .new { display: flex; gap: 8px; margin-bottom: 12px; }
  .hint { color: var(--muted); font-size: 12px; }
  .grid { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; margin-top: 10px; }
  /* 프로젝트 카드 */
  .pcard { width: 200px; min-height: 86px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); color: var(--text); text-decoration: none; user-select: none; }
  .pcard:hover { border-color: var(--accent); }
  .pcard.sel { outline: 2px solid var(--accent); outline-offset: 1px; background: rgba(255, 204, 0, 0.08); }
  .pcard b { font-size: 14px; }
  .pcard small, .gcard small { color: var(--muted); font-size: 11px; }
  .status[data-status='ongoing'] { color: var(--accent); }
  .status[data-status='done'] { color: var(--ok); }
  .status[data-status='waiting'] { color: var(--muted); }
  /* 그룹: 카드 두 장이 겹친 모양 */
  .gwrap { display: flex; flex-direction: column; gap: 8px; }
  .gwrap.open { flex-basis: 100%; }
  .gcard { position: relative; width: 200px; min-height: 86px; padding: 0; border: 0; background: none; cursor: pointer; text-align: left; font: inherit; color: var(--text); }
  .stack { position: absolute; inset: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); transform: translate(8px, -8px) rotate(2deg); opacity: 0.7; }
  .stack.s2 { transform: translate(4px, -4px) rotate(1deg); opacity: 0.85; }
  .face { position: relative; display: flex; flex-direction: column; gap: 6px; min-height: 86px; padding: 14px; border: 1px solid var(--accent); border-radius: 12px; background: var(--panel); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); }
  .gwrap.open .face { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .face b { font-size: 14px; }
  .sum { color: var(--text) !important; font-weight: 600; }
  .bill { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: 10px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 11px; padding: 4px 6px; border-bottom: 1px solid var(--line); }
  td { padding: 7px 6px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  td a { color: var(--text); text-decoration: none; font-weight: 600; }
  td a:hover { color: var(--accent); }
  td small { display: block; color: var(--muted); font-size: 11px; }
  .r { text-align: right; }
  .amounts { white-space: nowrap; }
  .amt { background: none; border: 1px dashed transparent; color: var(--text); font: inherit; font-size: 13px; padding: 2px 6px; border-radius: 6px; cursor: pointer; font-variant-numeric: tabular-nums; }
  .amt:not(:disabled):hover { border-color: var(--line); background: var(--input); }
  .amt:disabled { cursor: default; }
  .amt i { font-style: normal; font-size: 10px; color: var(--muted); margin-left: 4px; }
  .amt.total { color: var(--ok); font-weight: 700; }
  .amounts input { width: 120px; text-align: right; padding: 3px 6px; font-size: 13px; }
  .link { background: none; border: 0; color: var(--blue); text-decoration: underline; cursor: pointer; font: inherit; font-size: 11px; padding: 0 4px; }
  tfoot td { border-bottom: 0; padding-top: 10px; font-weight: 600; }
  .gactions { display: flex; justify-content: flex-end; margin-top: 6px; }
  select { width: auto; padding: 4px 6px; font-size: 12px; }
  /* 선택 모드 하단 탭 */
  .bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 40; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4); max-width: calc(100vw - 24px); flex-wrap: wrap; justify-content: center; }
  .bar .count { font-size: 13px; color: var(--muted); margin-right: 4px; }
  .bar form { display: flex; gap: 6px; }
  .bar form input { width: 180px; }
  .btn.on { border-color: var(--accent); color: var(--accent); }
  .pcard.picking { cursor: pointer; }
  .pick { position: absolute; top: 8px; right: 10px; color: var(--accent); font-size: 14px; }
  .pcard { position: relative; }
  tr.sel td { background: rgba(255, 204, 0, 0.08); }
  .landing { text-align: center; margin-top: 60px; }
  .landing p { color: var(--muted); line-height: 1.6; margin-bottom: 20px; }
  @media (max-width: 720px) { .pcard, .gcard { width: calc(50% - 7px); } .amounts input { width: 90px; } }
</style>
