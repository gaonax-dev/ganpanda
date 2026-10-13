<!-- 설정: 단축키 변경 (화면 조작 기본값은 xlpop 과 동일) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { ACTIONS, DEFAULT_KEYMAP, comboFromEvent, findConflicts, formatCombo, type Action } from '../core/keymap';

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
      <div class="tabs"><span class="on">단축키</span></div>
      <button class="icon" data-testid="close-settings" title="닫기 (Esc)" onclick={close}>✕</button>
    </header>

    <div class="body">
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
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 50; }
  .dialog { width: min(620px, calc(100vw - 32px)); max-height: calc(100vh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }
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
