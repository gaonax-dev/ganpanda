<!-- 설정: 단축키 변경 (화면 조작 기본값은 xlpop 과 동일) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { PLAN_LABEL } from '../auth';
  import { setRequestSettings } from '../requests';
  import { ACTIONS, DEFAULT_KEYMAP, comboFromEvent, findConflicts, formatCombo, type Action } from '../core/keymap';
  import { addTeamMember, listTeam, removeTeamMember, setTeamMember, type TeamMember } from '../projects';
  import { formatBytes } from '../core/format';

  // ---------- 계정 · 구독 · 사용량 · 멤버 (2026-10-15 사용자: "멤버 관리는 설정에서, 설정에 계정 구독 상태와 사용량 표시") ----------
  let members = $state<TeamMember[] | null>(null);
  // 요청 받기 설정 (요청판)
  let reqReceive = $state(app.requestSettings?.receive ?? false);
  let reqRegions = $state((app.requestSettings?.regions ?? []).join(', '));
  let reqBusy = $state(false), reqSaved = $state('');
  async function saveRequests() {
    reqBusy = true; reqSaved = '';
    try { await setRequestSettings({ receive: reqReceive, regions: reqRegions.split(',').map((s) => s.trim()).filter(Boolean) }); await app.refreshMe(); reqSaved = '저장했습니다'; }
    catch (e) { reqSaved = e instanceof Error ? e.message : String(e); }
    finally { reqBusy = false; }
  }
  let memberEmail = $state('');
  let memberError = $state('');
  async function loadTeam() { try { members = await listTeam(); } catch { members = []; } }
  $effect(() => { if (app.account) { app.refreshMe(); loadTeam(); } });
  async function addMember() {
    const em = memberEmail.trim();
    if (!em) return;
    memberError = '';
    try { await addTeamMember(em, false); memberEmail = ''; await loadTeam(); }
    catch { memberError = '그 이메일로 가입한 계정이 없습니다. 먼저 로그인해 계정을 만들게 해 주세요.'; }
  }

  /** 키 입력 대기 중인 동작 */
  let capture: { action: Action; mode: 'replace' | 'add' } | null = $state(null);

  const groups = $derived([...new Set(ACTIONS.map((a) => a.group))]);
  const conflicts = $derived(findConflicts(app.keymap));
  const label = (id: Action) => ACTIONS.find((a) => a.id === id)!.label;
  const fmt = (c: string) => formatCombo(c, app.isMac);
  const isDefault = (id: Action) => JSON.stringify(app.keymap[id]) === JSON.stringify(DEFAULT_KEYMAP[id]);

  function set(id: Action, combos: string[]) {
    app.setKeymap({ ...app.keymap, [id]: combos });
  }

  // 키 입력 받기 — 다른 단축키보다 먼저 가로챈다 (capture 단계)
  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!capture) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { capture = null; return; }
      const combo = comboFromEvent(e, app.isMac);
      if (!combo) return; // 수식키만 누름 → 계속 대기
      const cur = app.keymap[capture.action];
      set(capture.action, capture.mode === 'replace' ? [combo] : [...cur.filter((c) => c !== combo), combo]);
      capture = null;
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  function close() {
    capture = null;
    app.settingsOpen = false;
  }
</script>

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" data-testid="settings" role="dialog" aria-modal="true" aria-label="설정">
    <header>
      <h2>설정</h2>
      <div class="tabs"><span class="on">계정 · 멤버 · 단축키 · 표시</span></div>
      <button class="icon" data-testid="close-settings" title="닫기 (Esc)" onclick={close}>✕</button>
    </header>

    <div class="body">
      {#if app.account}
        <section data-testid="account-section">
          <h3>계정 · 구독</h3>
          <p class="row"><span>{app.account.email}</span><b data-testid="plan">{PLAN_LABEL[app.account.plan] ?? app.account.plan} 요금제</b></p>
          <p class="row"><span>비밀번호 {app.account.hasPassword ? '설정됨' : '없음 (메일 링크·소셜로 로그인)'}</span><button class="btn small" data-testid="settings-password" onclick={() => (app.passwordOpen = 'change')}>{app.account.hasPassword ? '바꾸기' : '만들기'}</button></p>
          {#if app.usage}
            <p class="row"><span>저장 용량</span><span data-testid="usage-storage">{formatBytes(app.usage.usage.storageBytes)} / {formatBytes(app.usage.limits.storageBytes)}</span></p>
            <div class="bar"><i style:width="{Math.min(100, (app.usage.usage.storageBytes / Math.max(1, app.usage.limits.storageBytes)) * 100)}%"></i></div>
            <p class="row"><span>동시 작업 인원 <small>(직원 · 고객 열람은 세지 않음)</small></span><span data-testid="usage-seats">{app.usage.usage.seats} / {app.usage.limits.seats}명</span></p>
            <p class="row"><span>이번 달 제안 링크</span><span data-testid="usage-proposals">{app.usage.usage.proposals}{app.usage.limits.proposalsPerMonth === null ? '건 (무제한)' : ` / ${app.usage.limits.proposalsPerMonth}건`}</span></p>
          {/if}
        </section>
        <!-- 사양 글 사전 (V2, 2026-10-19): 내 규칙 목록·삭제, 전국 기본값 수 -->
        <section data-testid="rules-section">
          <h3>사양 글 사전 <small class="hint">퀵입력이 못 알아본 말에 답한 뜻 — 내 사전이 전국 기본값보다 먼저</small></h3>
          {#if app.specRules.length}
            <ul class="rules">
              {#each app.specRules as r (r.phrase)}
                <li data-testid="rule-row"><b>{r.phrase}</b> → {r.meaning.map((m) => m.label).join(' · ')} <button class="icon" data-testid="rule-delete" title="지우기" onclick={() => app.removeSpecRule(r.phrase)}>✕</button></li>
              {/each}
            </ul>
          {:else}<p class="hint">아직 없습니다. 퀵입력 확인 창에서 뜻을 고르면 여기에 쌓입니다.</p>{/if}
          <p class="hint">전국 기본값(여러 계정이 같은 뜻으로 쓰는 말) {app.specDefaults.length}개</p>
          {#if !app.requestsEnabled}
            <!-- 지역 힌트 (V3, 2026-10-19): 요청판 지역 칸이 숨겨져 있을 때 여기서 — 같은 지역 사용자의 뜻을 추천에서 먼저 보여 주는 데만 쓴다 -->
            <label class="opt">내 지역 <small>(시·도부터, 예: 서울 송파구 — 같은 지역 사용자의 말뜻을 추천에서 먼저)</small><input data-testid="rules-region" bind:value={reqRegions} placeholder="예: 경기 광주시" onblur={saveRequests} /></label>
            {#if reqSaved}<p class="hint" data-testid="rules-region-saved">{reqSaved}</p>{/if}
          {/if}
        </section>
        <!-- 요청판 (2026-10-17): 요청 받기 + 지역 → 홈 "받은 요청". 지금은 숨김 (app.requestsEnabled) -->
        {#if app.requestsEnabled}
        <section data-testid="requests-section">
          <h3>견적 요청 받기</h3>
          <p class="hint">켜 두면 이 지역 가게 사장들의 간판 견적 요청이 홈 "받은 요청"과 이메일로 옵니다. 요청에서 바로 프로젝트를 만들어 제안 링크로 답하고(요금제의 제안 건수), 제안을 보내면 연락처가 보입니다.</p>
          <label class="check"><input type="checkbox" data-testid="req-receive" bind:checked={reqReceive} /> 요청 받기</label>
          <label class="opt">지역 <small>(시/군/구까지, 여러 곳은 쉼표)</small><input data-testid="req-regions" bind:value={reqRegions} placeholder="예: 경기 광주시, 성남시 분당구" /></label>
          <p class="row"><span class="hint" data-testid="req-saved">{reqSaved}</span><button class="btn small primary" data-testid="req-save" onclick={saveRequests} disabled={reqBusy}>저장</button></p>
        </section>
        {/if}
        <section data-testid="team-section">
          <h3>멤버</h3>
          <p class="hint">멤버는 내 프로젝트 그룹과 계산서를 봅니다. 정산 금액은 "정산 보기"를 켠 멤버만 봅니다. 가입된 계정의 이메일로 추가합니다.</p>
          {#each members ?? [] as m (m.accountId)}
            <div class="member" data-testid="team-member">
              <span>{m.name || m.email}<small>{m.email}</small></span>
              <label class="check"><input type="checkbox" data-testid="member-billing" checked={m.canBilling} onchange={async (e) => { await setTeamMember(m.accountId, e.currentTarget.checked); await loadTeam(); }} /> 정산 보기</label>
              <button class="icon" title="멤버 제거" data-testid="member-remove" onclick={async () => { await removeTeamMember(m.accountId); await loadTeam(); }}>✕</button>
            </div>
          {:else}
            {#if members}<p class="hint">아직 멤버가 없습니다.</p>{/if}
          {/each}
          <form class="add" onsubmit={(e) => { e.preventDefault(); addMember(); }}>
            <input data-testid="member-email" placeholder="멤버 이메일 (가입된 계정)" bind:value={memberEmail} />
            <button class="btn small" data-testid="member-add" type="submit" disabled={!memberEmail.trim()}>추가</button>
          </form>
          {#if memberError}<p class="hint err" data-testid="member-error">{memberError}</p>{/if}
        </section>
      {/if}
      <section>
        <h3>표시</h3>
        <label class="check"><input type="checkbox" data-testid="warn-measure" checked={app.warnMeasure} onchange={(e) => app.setWarnMeasure(e.currentTarget.checked)} /> 입력 치수가 사진 추정과 많이 다르면 경고(⚠) 표시</label>
        <label class="check gz">매니퓰레이터 크기
          <input type="range" data-testid="gizmo-size" min="32" max="96" step="8" value={app.gizmoSize} oninput={(e) => app.setGizmoSize(Number(e.currentTarget.value))} />
          <span>{app.gizmoSize}px</span>
        </label>
        <p class="hint">치수는 제작용 메모이고 3D 는 그린 영역에 맞춥니다. 경고는 참고용이라 기본은 꺼져 있습니다.</p>
      </section>
      {#each groups as g (g)}
        <section>
          <h3>{g}</h3>
          <table>
            <tbody>
              {#each ACTIONS.filter((a) => a.group === g) as a (a.id)}
                {@const editing = capture?.action === a.id}
                <tr data-testid="shortcut-row-{a.id}" class:editing>
                  <td class="name">{a.label}</td>
                  <td class="keys">
                    {#if editing}
                      <span class="wait">{capture?.mode === 'add' ? '추가할' : '새'} 키를 누르세요 · Esc 취소</span>
                    {:else}
                      {#each app.keymap[a.id] as c (c)}
                        <span class="kbd">{fmt(c)}<button title="삭제" onclick={() => set(a.id, app.keymap[a.id].filter((x) => x !== c))}>×</button></span>
                      {:else}
                        <span class="none">없음</span>
                      {/each}
                    {/if}
                  </td>
                  <td class="actions">
                    <button class="btn small" data-testid="shortcut-edit-{a.id}" onclick={() => (capture = { action: a.id, mode: 'replace' })}>변경</button>
                    <button class="btn small" data-testid="shortcut-add-{a.id}" title="키 추가" onclick={() => (capture = { action: a.id, mode: 'add' })}>＋</button>
                    <button class="icon" title="기본값 ({DEFAULT_KEYMAP[a.id].map(fmt).join(', ')})" disabled={isDefault(a.id)}
                      onclick={() => set(a.id, [...DEFAULT_KEYMAP[a.id]])}>↺</button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/each}

      {#each conflicts as c (c.combo)}
        <p class="conflict" data-testid="shortcut-conflict">
          ⚠ <b>{fmt(c.combo)}</b> 키가 {c.actions.map(label).join(', ')}에 함께 지정되어 있습니다. 앞에 있는 동작({label(c.actions[0])})만 실행됩니다.
        </p>
      {/each}

      <section>
        <h3>마우스·트랙패드 (고정)</h3>
        <table>
          <tbody>
            <tr><td class="name">확대·축소</td><td class="keys"><span class="kbd">마우스 휠</span><span class="kbd">{app.isMac ? '⌃' : 'Ctrl'} + 휠</span><span class="kbd">핀치</span></td></tr>
            <tr><td class="name">화면 이동</td><td class="keys"><span class="kbd">트랙패드 스크롤</span><span class="kbd">빈 곳 드래그</span><span class="kbd">가운데 버튼 드래그</span></td></tr>
            <tr><td class="name">선택 해제 · 입력 종료</td><td class="keys"><span class="kbd">Esc</span></td></tr>
          </tbody>
        </table>
      </section>
    </div>

    <footer>
      <span class="hint">글자 키는 키보드 위치 기준이라 한글 입력 상태에서도 동작합니다.</span>
      <button class="btn small" data-testid="shortcuts-reset-all" onclick={() => { capture = null; app.resetKeymap(); }}>모두 기본값으로</button>
    </footer>
  </div>
</div>

<style>
  .rules { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
  .rules li { display: flex; align-items: center; gap: 6px; }
  .rules .icon { margin-left: auto; }
  .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
  .bar { height: 6px; background: var(--input); border-radius: 3px; overflow: hidden; margin: 2px 0 6px; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .member { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .member > span { flex: 1; } .member small { display: block; color: var(--muted); font-size: 11px; }
  .add { display: flex; gap: 6px; margin-top: 8px; }
  .err { color: var(--danger); }
  .check { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .opt { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 13px; white-space: nowrap; }
  .opt > input { flex: 1; min-width: 0; }
  .gz { margin-top: 8px; }
  .gz input { flex: 1; }
  .hint { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 50; }
  .dialog { width: min(620px, calc(100vw - 32px)); max-height: calc(100dvh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }
  header { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 16px; }
  .tabs span { font-size: 13px; padding: 4px 10px; border-radius: 6px; }
  .tabs .on { background: var(--input); }
  header .icon { margin-left: auto; }
  .body { overflow-y: auto; padding: 4px 16px 12px; }
  section { margin-top: 12px; }
  h3 { font-size: 12px; color: var(--muted); margin: 0 0 6px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  tr { border-bottom: 1px solid var(--line); }
  tr.editing { background: rgba(255, 204, 0, 0.06); }
  td { padding: 7px 4px; font-size: 13px; vertical-align: middle; }
  td.name { width: 38%; }
  td.keys { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; min-height: 36px; }
  td.actions { text-align: right; white-space: nowrap; }
  td.actions .btn { margin-left: 4px; }
  .kbd { display: inline-flex; align-items: center; gap: 4px; background: var(--input); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 2px 7px; font-size: 12px; font-family: inherit; font-variant-numeric: tabular-nums; }
  .kbd button { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0; font-size: 12px; }
  .kbd button:hover { color: var(--danger); }
  .none { color: var(--muted); font-size: 12px; }
  .wait { color: var(--accent); font-size: 12px; }
  .conflict { background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); border-radius: 8px; padding: 8px 10px; font-size: 12px; margin: 12px 0 0; }
  .icon:disabled { opacity: 0.3; cursor: default; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--line); }
  .hint { color: var(--muted); font-size: 12px; }
</style>
