<!--
  홈: 내 프로젝트 카드 + 프로젝트 그룹.
  2026-10-15 사용자: "프로젝트를 시프트 키 상태에서 두 개를 잡고 오른쪽 마우스로 그룹 만들기. 리스트 뷰의 계산값이 계약 금액. 입금액은 표시를 클릭하면
  입력란, 계약 금액도 사용자가 입력하면 그 금액이 표시되고 자동 계산 복구 버튼. 그룹은 두 프로젝트가 겹쳐진 것같이 표시, 클릭 시 폴딩.
  그룹을 클릭하면 전체 정보·비용 계산서. 멤버 관리는 설정에서."
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { splitShelf } from '../core/projectShelf';
  import { bizDocUrl, listMyRequests, type MyRequest } from '../requests';
  import { measureLabel } from '../core/measureSummary';
  import { groupDday, projectDday } from '../core/dday';
  import type { ProjectDetails } from '../projects';
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
  /** 내가 보낸 견적 요청 (가게 사장, 2026-10-21 로그인 요청): 키 없이 세션으로 연다 */
  let myRequests = $state<MyRequest[]>([]);
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
      if (app.requestsEnabled) listMyRequests().then((rs) => (myRequests = rs)).catch(() => (myRequests = []));
      const next: Record<string, GroupView> = {};
      await Promise.all(groups.map(async (g) => { next[g.id] = await getGroup(g.id); }));
      views = next;
    } catch { projects ??= []; }
  }
  $effect(() => {
    if (app.account) reload();
    else { projects = null; groups = []; views = {}; }
  });

  // 만들기 폼 (2026-10-21 "만들기 입력필드가 포커싱되면 하단에 연락처, 주소, 계약일, 시작일, 완료일, 메모 마지막에 x마크 … 제목빼고 다옵션")
  let formOpen = $state(false);
  const emptyDetails = (): Required<ProjectDetails> => ({ contact: '', address: '', contractDate: '', startDate: '', dueDate: '', memo: '' });
  let newDetails = $state(emptyDetails());
  function closeForm() { formOpen = false; newDetails = emptyDetails(); }
  async function create() {
    const n = name.trim();
    if (!n || busy) return;
    busy = true;
    try { const p = await createProject(n, newDetails); location.href = `/?room=${p.id}`; } finally { busy = false; }
  }

  // 속성창 (2026-10-21 "카드 오른쪽끝에 상단에 매뉴버튼으로 속성창 열리고 수정 토글버튼으로 수정. 수정전 상태에는 전화걸기복사, 카톡, 주소복사 내용 없으면 안보이게")
  // 보기(기본): 연락처 → [전화] [복사] [카톡], 주소 → [복사] — 내용이 없으면 줄 자체를 안 보인다. [수정] 토글 → 입력 폼
  let details = $state<ProjectInfo | null>(null);
  let detailsEdit = $state(false);
  let copied = $state('');
  async function copyText(label: string, text: string) {
    try { await navigator.clipboard.writeText(text); copied = `${label} 복사됨`; } catch { copied = '복사할 수 없습니다 — 길게 눌러 복사해 주세요'; }
    setTimeout(() => (copied = ''), 1500);
  }
  /** 카톡: 전화번호로 대화를 여는 공개 주소가 없어 번호를 복사하고(휴대폰이면 카카오톡을 연다) 친구 찾기로 안내 */
  async function kakao(phone: string) {
    await copyText('번호', phone);
    if (app.compact) location.href = 'kakaotalk://';
    else copied = '번호 복사됨 — 카카오톡에서 친구를 찾아 보내세요';
  }
  const telHref = (s: string) => `tel:${s.replace(/[^\d+]/g, '')}`;
  let draft = $state<Required<ProjectDetails> & { name: string; status: ProjectStatus }>({ name: '', status: 'waiting', ...emptyDetails() });
  let detailsBusy = $state(false);
  function openDetails(p: ProjectInfo, edit = false) {
    details = p; detailsEdit = edit; copied = '';
    draft = { name: p.name, status: p.status, contact: p.contact ?? '', address: p.address ?? '', contractDate: p.contractDate ?? '', startDate: p.startDate ?? '', dueDate: p.dueDate ?? '', memo: p.memo ?? '' };
  }
  async function saveDetails() {
    if (!details || detailsBusy) return;
    const n = draft.name.trim();
    if (!n) return;
    detailsBusy = true;
    try { await updateProject(details.id, { ...draft, name: n }); const id = details.id; await reload(); details = projects?.find((x) => x.id === id) ?? null; detailsEdit = false; } finally { detailsBusy = false; }
  }
  /** 카드 오른쪽 위 ⋯ → 속성창. 선택 모드에서는 고르기 */
  function clickMenu(e: MouseEvent, p: ProjectInfo) {
    if (selectMode) return;
    e.preventDefault(); e.stopPropagation();
    openDetails(p);
  }
  const ungrouped = $derived((projects ?? []).filter((p) => !p.groupId));
  // 지난 프로젝트 접기 (2026-10-21 "정지, 완료 해당 일자가 6개월이 지난 프로젝트는 다시 연도별 폴딩"): 정지·완료 6개월 지남 → 접힘, 안에서 연도별
  const shelf = $derived(splitShelf(ungrouped));

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
  /** 선택한 프로젝트의 상태를 한 번에 (2026-10-21 "선택 후 나오는 메뉴에 상태변경 진행,정지, 완료 추가") */
  async function setStatus(status: ProjectStatus) {
    const ids = [...selected];
    selected = new Set(); selectMode = false;
    for (const id of ids) await updateProject(id, { status });
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

{#snippet card(p: ProjectInfo)}
  {@const m = measureLabel(p, STATUS_LABEL[p.status])}
  {@const d = projectDday(p)}
  <a class="pcard" data-testid="project-item" data-id={p.id} data-status={p.status} data-measure={m.kind} class:sel={selected.has(p.id)} class:picking={selectMode} href="/?room={p.id}" onclick={(e) => clickCard(e, p.id)}>
    {#if selectMode}<span class="pick" aria-hidden="true">{selected.has(p.id) ? '◉' : '○'}</span>
    {:else}<button class="menu" type="button" data-testid="project-menu" title="속성" aria-label="속성" onclick={(e) => clickMenu(e, p)}>⋯</button>{/if}
    <b>{p.name}</b>
    <!-- 아래 글자 = 상태 · 실측 숫자(미측정/전체, 다 재면 전체) · D-day (2026-10-21). 속성은 오른쪽 위 ⋯ -->
    <small class="meta" data-testid="project-meta">
      <span class="status" data-status={p.status}>{m.label}</span>
      {#if m.count}<span class="count" data-testid="project-count" data-measure={m.kind} title={m.title}>{m.count}</span>{/if}
      <span class="dday" data-testid="project-dday" title={d.title} class:late={d.days < 0}>{d.label}</span>
    </small>
  </a>
{/snippet}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { if (selectMode) toggleSelectMode(); editing = null; } }} />

<div class="home">
  {#if !app.authReady}
    <p class="hint">확인 중…</p>
  {:else if app.account}
    {#if app.requestsEnabled && myRequests.length}
      <section class="requests" data-testid="my-request-list">
        <h1>내 견적 요청 <small><a href="/estimate">새 요청</a></small></h1>
        {#each myRequests as r (r.id)}
          <a class="rcard mine" data-testid="my-request-item" data-status={r.status} href="/r/{r.id}">
            <b>{r.store}</b><span class="muted">{r.region} · {date(r.createdAt)} · 사인물 {r.signs?.length ?? 0}개</span>
            <span class="resp" data-testid="my-request-responses">{r.status === 'approved' ? '승인됨' : r.responses ? `제안 ${r.responses}건` : '제안 기다리는 중'}</span>
          </a>
        {/each}
      </section>
    {/if}
    {#if app.requestsEnabled && (requests.length || app.requestSettings?.receive)}
      <section class="requests" data-testid="request-list">
        <h1>받은 요청 <small>{app.requestSettings?.regions.join(', ') || '지역을 설정하세요'} · <button class="link" onclick={() => (app.settingsOpen = 'requests')}>설정</button></small></h1>
        {#each requests as r (r.id)}
          <div class="rcard" data-testid="request-item" data-status={r.status} data-responded={r.responded}>
            <div class="rphotos">{#each r.photos as p (p.n)}<img src={shopPhotoUrl(r.id, p.n)} alt="" />{/each}</div>
            <div class="rbody">
              <b>{r.store}</b> {#if r.bizStatus === 'active'}<span class="biz" data-testid="request-biz" title="국세청 사업자등록 상태조회로 확인된 사업자">✓ 사업자 확인</span>{/if} <span class="muted">{r.region} · {date(r.createdAt)}{r.status === 'approved' ? ' · 승인됨' : ''}</span>
              {#if r.address}<p class="muted" data-testid="request-address">📍 {r.address}</p>{/if}
              {#if r.bizDoc}<p class="muted" data-testid="request-bizdoc">📄 사업자등록증 사본 {#if r.responded}<a href={bizDocUrl(r.id)} target="_blank" rel="noopener" data-testid="request-bizdoc-open">열기</a>{:else}<span>— 제안을 보내면 열립니다</span>{/if}</p>{/if}
              {#if r.signs?.length}<p class="muted" data-testid="request-signs">✎ 사인물 {r.signs.length}개 · 치수 {r.signs.filter((s) => s.widthMm && s.heightMm).length}개 — 제안 만들기로 열면 그대로 그려집니다</p>{/if}
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
      <form class="new" class:open={formOpen} data-testid="new-project-form" onsubmit={(e) => { e.preventDefault(); create(); }}>
        <div class="row1">
          <input data-testid="new-project-name" placeholder="새 프로젝트 이름 (예: 간판다 카페)" bind:value={name} onfocus={() => (formOpen = true)} />
          <button class="btn primary" data-testid="new-project-submit" type="submit" disabled={busy || !name.trim()}>만들기</button>
          {#if projects?.length}<button class="btn" type="button" class:on={selectMode} data-testid="select-mode" title="프로젝트를 골라 그룹으로 묶거나 삭제" onclick={toggleSelectMode}>{selectMode ? '◉ 선택 중' : '○ 선택'}</button>{/if}
        </div>
        {#if formOpen}
          <!-- 제목 빼고 다 선택 (2026-10-21) -->
          <div class="more" data-testid="new-project-details">
            <input data-testid="new-contact" placeholder="연락처" bind:value={newDetails.contact} />
            <input data-testid="new-address" placeholder="주소" bind:value={newDetails.address} />
            <label>계약일<input data-testid="new-contract-date" type="date" bind:value={newDetails.contractDate} /></label>
            <label>시작일<input data-testid="new-start-date" type="date" bind:value={newDetails.startDate} /></label>
            <label>완료일<input data-testid="new-due-date" type="date" bind:value={newDetails.dueDate} /></label>
            <input class="memo" data-testid="new-memo" placeholder="메모" bind:value={newDetails.memo} />
            <button class="icon x" type="button" data-testid="new-project-close" title="접기 (입력한 선택 항목은 지움)" onclick={closeForm}>✕</button>
          </div>
        {/if}
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
                <small>{v ? `프로젝트 ${v.projects.length}개` : '…'}{g.role === 'member' ? ' · 멤버' : ''} · <span class="dday" data-testid="group-dday" title={groupDday(v?.projects ?? [], g.createdAt).title}>{groupDday(v?.projects ?? [], g.createdAt).label}</span></small>
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

        <!-- 프로젝트 카드 (그룹 밖) — 정지·완료 6개월 지난 것은 아래 "지난 프로젝트" 에 -->
        {#each shelf.current as p (p.id)}{@render card(p)}{/each}
      </div>
      {#if shelf.shelvedCount}
        <details class="shelf" data-testid="shelf">
          <summary>지난 프로젝트 <small>정지·완료 6개월 지남 · {shelf.shelvedCount}개</small></summary>
          {#each shelf.shelved as y (y.year)}
            <details class="year" data-testid="shelf-year" data-year={y.year}>
              <summary>{y.year}년 <small>{y.projects.length}개</small></summary>
              <div class="grid">{#each y.projects as p (p.id)}{@render card(p)}{/each}</div>
            </details>
          {/each}
        </details>
      {/if}
      {#if projects === null}<p class="hint">불러오는 중…</p>
      {:else if !projects.length}<p class="hint">아직 프로젝트가 없습니다. 매장 이름으로 첫 프로젝트를 만들어 보세요.</p>{/if}
    </section>
  {:else}
    <section class="landing" data-testid="landing">
      <h1>간판다</h1>
      <p>건물 사진 위에서 사인물을 함께 정하고 견적까지.</p>
      <!-- 시작 분기 (2026-10-21 "시작(로그인전) 사업자 소비자 구분"): 간판집은 로그인, 가게 사장은 로그인 없이 견적 요청 -->
      <div class="who">
        <button class="btn primary big" data-testid="landing-shop" onclick={() => (app.loginOpen = true)}>간판집입니다<small>로그인 · 회원가입 — 실측·제안·주문서</small></button>
        <a class="btn big" data-testid="landing-consumer" href="/estimate">가게 사장입니다<small>사진에 간판을 그려 참고 견적을 보고, 동네 간판집에 견적 요청</small></a>
      </div>
      <p class="hint">초대 링크로 받은 제안은 로그인 없이 바로 열립니다.</p>
    </section>
  {/if}
</div>

{#if details}
  <div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) details = null; }}>
    <div class="dialog" data-testid="project-details" data-mode={detailsEdit ? 'edit' : 'view'} role="dialog" aria-modal="true" aria-label="프로젝트 속성">
    <header>
      <h2>{detailsEdit ? '속성 수정' : details.name}</h2>
      <button class="btn small" class:on={detailsEdit} type="button" data-testid="details-edit" title="수정 켜기/끄기" onclick={() => { if (detailsEdit) openDetails(details!); else detailsEdit = true; }}>{detailsEdit ? '수정 중' : '수정'}</button>
      <button class="icon" type="button" data-testid="details-close" title="닫기" onclick={() => (details = null)}>✕</button>
    </header>
    {#if !detailsEdit}
      {@const m = measureLabel(details, STATUS_LABEL[details.status])}
      {@const d = projectDday(details)}
      <div class="view" data-testid="details-view">
        <p class="row"><span>상태</span><span class="status" data-status={details.status}>{STATUS_LABEL[details.status]}{m.count ? ` · ${m.title}` : ''}</span></p>
        {#if details.contact}
          <p class="row" data-testid="details-contact-row"><span>연락처 <b>{details.contact}</b></span>
            <span class="acts">
              <a class="btn small" data-testid="details-call" href={telHref(details.contact)}>전화</a>
              <button class="btn small" type="button" data-testid="details-copy-phone" onclick={() => copyText('번호', details!.contact!)}>복사</button>
              <button class="btn small kakao" type="button" data-testid="details-kakao" onclick={() => kakao(details!.contact!)}>카톡</button>
            </span></p>
        {/if}
        {#if details.address}
          <p class="row" data-testid="details-address-row"><span>주소 <b>{details.address}</b></span>
            <span class="acts"><button class="btn small" type="button" data-testid="details-copy-address" onclick={() => copyText('주소', details!.address!)}>복사</button></span></p>
        {/if}
        {#if details.contractDate || details.startDate || details.dueDate}
          <p class="row"><span>{[details.contractDate && `계약 ${details.contractDate}`, details.startDate && `시작 ${details.startDate}`, details.dueDate && `완료 ${details.dueDate}`].filter(Boolean).join(' · ')}</span><span class="dday" class:late={d.days < 0} title={d.title}>{d.label}</span></p>
        {:else}
          <p class="row"><span class="hint">날짜 없음 (만든 날 {date(details.createdAt)})</span><span class="dday" title={d.title}>{d.label}</span></p>
        {/if}
        {#if details.memo}<p class="memo" data-testid="details-memo-view">{details.memo}</p>{/if}
        {#if copied}<p class="hint ok" data-testid="details-copied">{copied}</p>{/if}
      </div>
      <footer>
        <a class="btn small" href="/?room={details.id}">프로젝트 열기</a>
        <span class="grow"></span>
        <button class="btn small" type="button" onclick={() => (details = null)}>닫기</button>
      </footer>
    {:else}
    <form class="dform" onsubmit={(e) => { e.preventDefault(); saveDetails(); }}>
      <label>이름<input data-testid="details-name" bind:value={draft.name} /></label>
      <label>상태<select data-testid="details-status" bind:value={draft.status}>{#each Object.entries(STATUS_LABEL) as [k, label] (k)}<option value={k}>{label}</option>{/each}</select></label>
      <label>연락처<input data-testid="details-contact" bind:value={draft.contact} placeholder="010-0000-0000" /></label>
      <label>주소<input data-testid="details-address" bind:value={draft.address} /></label>
      <div class="dates">
        <label>계약일<input data-testid="details-contract-date" type="date" bind:value={draft.contractDate} /></label>
        <label>시작일<input data-testid="details-start-date" type="date" bind:value={draft.startDate} /></label>
        <label>완료일<input data-testid="details-due-date" type="date" bind:value={draft.dueDate} /></label>
      </div>
      <label>메모<textarea data-testid="details-memo" rows="3" bind:value={draft.memo}></textarea></label>
      <p class="hint">실측 {measureLabel(details, STATUS_LABEL[details.status]).title || '사인물 없음'} · {projectDday(details).title} · 만든 날 {date(details.createdAt)}</p>
      <footer>
        <a class="btn small" href="/?room={details.id}">프로젝트 열기</a>
        <span class="grow"></span>
        <button class="btn small" type="button" onclick={() => openDetails(details!)}>취소</button>
        <button class="btn small primary" type="submit" data-testid="details-save" disabled={detailsBusy || !draft.name.trim()}>저장</button>
      </footer>
    </form>
    {/if}
    </div>
  </div>
{/if}

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
      <!-- 상태 바꾸기 (2026-10-21): 진행 · 정지 · 완료 -->
      <span class="seg" title="고른 프로젝트의 상태">
        <button class="btn small" data-testid="bar-status-ongoing" disabled={!selected.size} onclick={() => setStatus('ongoing')}>진행</button>
        <button class="btn small" data-testid="bar-status-paused" disabled={!selected.size} onclick={() => setStatus('paused')}>정지</button>
        <button class="btn small" data-testid="bar-status-done" disabled={!selected.size} onclick={() => setStatus('done')}>완료</button>
      </span>
      <button class="btn small danger" data-testid="bar-delete" disabled={!selected.size} onclick={removeSelected}>삭제</button>
      <button class="btn small" data-testid="bar-cancel" onclick={toggleSelectMode}>취소</button>
    {/if}
  </div>
{/if}

<style>
  .requests h1 small { font-size: 12px; font-weight: 400; color: var(--muted); margin-left: 8px; }
  .link { background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0; font-size: 12px; }
  .rcard .biz { color: var(--ok); font-size: 11px; border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
  .rcard.mine { align-items: center; text-decoration: none; color: var(--text); font-size: 13px; }
  .rcard.mine .resp { margin-left: auto; color: var(--accent); white-space: nowrap; }
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
  .new { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .new .row1 { display: flex; gap: 8px; }
  /* 만들기 펼침: 제목 빼고 다 선택 (2026-10-21) */
  .more { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 10px; border: 1px dashed var(--line); border-radius: 10px; }
  .more > input { flex: 1 1 160px; }
  .more > input.memo { flex: 2 1 260px; }
  .more label { flex-direction: row; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; }
  .more label input { width: auto; }
  .more .x { margin-left: auto; }
  /* 카드 아래 글자 */
  .pcard .meta { display: flex; gap: 6px; align-items: center; }
  .count[data-measure='waiting'] { color: var(--muted); }
  .count[data-measure='measuring'] { color: var(--accent); font-weight: 600; }
  .count[data-measure='measured'] { color: var(--ok); font-weight: 600; }
  .dday { font-variant-numeric: tabular-nums; }
  .dday.late { color: var(--warn); }
  /* 상세 내역 창 */
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: grid; place-items: center; z-index: 50; }
  .dialog { width: min(460px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  .dform { display: flex; flex-direction: column; gap: 8px; }
  .dialog header { display: flex; align-items: center; justify-content: space-between; }
  .dialog h2 { margin: 0; font-size: 15px; }
  .dialog .dates { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .dialog textarea { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 7px; padding: 7px 9px; font: inherit; font-size: 13px; width: 100%; resize: vertical; }
  .dialog footer { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
  .dialog .grow { flex: 1; }
  @media (max-width: 720px) { .dialog .dates { grid-template-columns: 1fr; } }
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
  .status[data-status='paused'] { color: var(--warn); }
  /* 지난 프로젝트 접기 */
  .shelf { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 10px; }
  .shelf summary { cursor: pointer; font-size: 14px; font-weight: 600; color: var(--muted); list-style: none; display: flex; align-items: center; gap: 8px; }
  .shelf summary::before { content: '▸'; font-size: 12px; }
  .shelf[open] > summary::before, .year[open] > summary::before { content: '▾'; }
  .shelf summary small { font-weight: 400; font-size: 12px; }
  .year { margin: 8px 0 0 14px; }
  .year summary { font-size: 13px; }
  .year .grid { margin-left: 14px; }
  .bar .seg { gap: 2px; padding: 2px; }
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
  .pcard .menu { position: absolute; top: 6px; right: 6px; background: none; border: 0; color: var(--muted); font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px; cursor: pointer; }
  .pcard .menu:hover { background: rgba(255,255,255,0.08); color: var(--text); }
  .pcard b { padding-right: 22px; }
  .dialog .view { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .dialog .view .row { align-items: center; gap: 8px; }
  .dialog .acts { display: flex; gap: 4px; flex-shrink: 0; }
  .dialog .kakao { background: #fee500; color: #191919; border-color: #fee500; }
  .dialog .memo { margin: 0; white-space: pre-wrap; background: var(--input); border-radius: 8px; padding: 8px 10px; font-size: 13px; }
  .dialog .ok { color: var(--ok); }
  .dialog header .btn { margin-left: auto; margin-right: 8px; }
  .pcard { position: relative; }
  tr.sel td { background: rgba(255, 204, 0, 0.08); }
  .landing { text-align: center; margin-top: 60px; }
  .who { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin: 18px 0 10px; }
  .who .big { display: flex; flex-direction: column; gap: 4px; align-items: center; padding: 16px 22px; min-width: 240px; text-decoration: none; font-size: 15px; font-weight: 700; }
  .who .big small { font-weight: 400; font-size: 12px; color: inherit; opacity: 0.8; white-space: normal; max-width: 240px; }
  .landing p { color: var(--muted); line-height: 1.6; margin-bottom: 20px; }
  @media (max-width: 720px) { .pcard, .gcard { width: calc(50% - 7px); } .amounts input { width: 90px; } }
</style>
