<!--
  색 라이브러리 창 (2026-10-17 사용자: "컬러 카드를 놓고 컬러 생성 대화창으로 만들고 페인트,시트,천,필름 선택하고 컬러이름 컬러피커로 컬러선택 공급사명 해당코드 입력.
  해당 컬러는 라이브러리에 저장해서 꺼내쓴다. 프로젝트내에서 컬러대화창에서 바로 선택").
  왼쪽: 라이브러리 카드 목록(누르면 바로 적용, ✕ 삭제) · 오른쪽: 새 카드 만들기(종류·이름·색·공급사·코드) → [저장하고 적용]
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { COLOR_KINDS, cardRef, newColorCard, type ColorCard, type ColorKind } from '../core/colorLibrary';

  let { onpick, onclose, current = null }: { onpick: (c: ColorCard) => void; onclose: () => void; /** 지금 이 필드에 들어 있는 카드 id */ current?: string | null } = $props();
  let kind = $state<ColorKind>(COLOR_KINDS[0]);
  let name = $state('');
  let hex = $state('#7a1f2e');
  let supplier = $state('');
  let code = $state('');
  let filter = $state<ColorKind | ''>('');
  let error = $state('');
  const list = $derived([...app.colorLibrary].filter((c) => !filter || c.kind === filter).sort((a, b) => b.createdAt - a.createdAt));
  const fixHex = (v: string) => { const t = v.trim().toLowerCase(); return /^#?[0-9a-f]{6}$/.test(t) ? (t.startsWith('#') ? t : `#${t}`) : null; };
  async function save() {
    error = '';
    const h = fixHex(hex);
    if (!name.trim()) { error = '색 이름을 적어 주세요.'; return; }
    if (!h) { error = '색은 #rrggbb 형식이어야 합니다.'; return; }
    const card = newColorCard({ kind, name, hex: h, supplier, code });
    await app.addColorCard(card);
    onpick(card);
    onclose();
  }
</script>

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="색 라이브러리" data-testid="color-dialog">
    <header><h2>색 라이브러리</h2><button class="icon" data-testid="color-close" title="닫기" onclick={onclose}>✕</button></header>
    <div class="body">
      <section class="lib">
        <div class="filters">
          <button class="chip" class:on={filter === ''} onclick={() => (filter = '')}>전체</button>
          {#each COLOR_KINDS as k (k)}<button class="chip" class:on={filter === k} data-testid="color-filter-{k}" onclick={() => (filter = k)}>{k}</button>{/each}
          <span class="cnt">{list.length}개</span>
        </div>
        {#if !list.length}
          <p class="empty">저장된 색이 없습니다. 오른쪽에서 첫 색을 만들어 보세요.</p>
        {/if}
        <ul class="cards" data-testid="color-cards">
          {#each list as c (c.id)}
            <li class:on={c.id === current}>
              <button class="card" data-testid="color-card-{c.id}" data-name={c.name} title="이 색 적용" onclick={() => { onpick(c); onclose(); }}>
                <i style:background={c.hex}></i>
                <span class="nm">{c.name}</span>
                <small>{cardRef(c)} · {c.hex}</small>
              </button>
              <button class="icon del" data-testid="color-delete-{c.id}" title="라이브러리에서 삭제" onclick={() => { if (confirm(`"${c.name}" 색을 라이브러리에서 지울까요? (이미 쓴 사인물의 색은 그대로)`)) app.removeColorCard(c.id); }}>✕</button>
            </li>
          {/each}
        </ul>
      </section>
      <section class="form">
        <h3>새 색 만들기</h3>
        <label>종류
          <select data-testid="color-kind" bind:value={kind}>{#each COLOR_KINDS as k (k)}<option value={k}>{k}</option>{/each}</select>
        </label>
        <label>색 이름<input data-testid="color-name" placeholder="예: 버건디" maxlength="40" bind:value={name} /></label>
        <label>색
          <span class="hexrow">
            <input type="color" data-testid="color-hex" value={fixHex(hex) ?? '#888888'} oninput={(e) => (hex = e.currentTarget.value)} />
            <input class="hextext" data-testid="color-hex-text" bind:value={hex} placeholder="#rrggbb" maxlength="7" />
          </span>
        </label>
        <label>공급사<input data-testid="color-supplier" placeholder="예: 3M, 삼화페인트" maxlength="60" bind:value={supplier} /></label>
        <label>공급사 코드<input data-testid="color-code" placeholder="예: 1080-G13" maxlength="60" bind:value={code} /></label>
        {#if error}<p class="err" data-testid="color-error">{error}</p>{/if}
        <button class="btn primary" data-testid="color-save" onclick={save}>저장하고 적용</button>
        <small class="hint">라이브러리는 내 계정에 저장되어 모든 프로젝트에서 쓸 수 있습니다{app.account ? '' : ' (로그인하면 기기 간에도 같이)'}.</small>
      </section>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 80; }
  .dialog { width: min(720px, calc(100vw - 24px)); max-height: calc(100vh - 24px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px 16px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 15px; }
  h3 { margin: 0 0 4px; font-size: 13px; }
  .body { display: grid; grid-template-columns: 1fr 240px; gap: 14px; min-height: 0; }
  .lib { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .filters { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .chip { padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); background: var(--input, rgba(255,255,255,0.04)); color: var(--text); font-size: 11px; cursor: pointer; }
  .chip.on { border-color: var(--accent); color: var(--accent); }
  .cnt { margin-left: auto; color: var(--muted); font-size: 11px; }
  .empty { color: var(--muted); font-size: 12px; margin: 8px 0; }
  .cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; overflow: auto; max-height: 52vh; }
  .cards li { position: relative; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,0.03); }
  .cards li.on { border-color: var(--accent); }
  .card { width: 100%; display: grid; grid-template-columns: 26px 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: center; text-align: left; padding: 8px 26px 8px 8px; background: none; border: 0; color: var(--text); cursor: pointer; font: inherit; }
  .card i { grid-row: 1 / 3; width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); }
  .card .nm { font-size: 12px; font-weight: 600; }
  .card small { color: var(--muted); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .del { position: absolute; right: 2px; top: 2px; width: 20px; height: 20px; font-size: 11px; }
  .form { display: flex; flex-direction: column; gap: 8px; }
  .form label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); }
  .form input, .form select { font: inherit; }
  .hexrow { display: flex; gap: 6px; align-items: center; }
  .hexrow input[type='color'] { width: 40px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; }
  .hextext { flex: 1; min-width: 0; }
  .err { color: #ff8a80; font-size: 12px; margin: 0; }
  .hint { color: var(--muted); font-size: 11px; }
  @media (max-width: 640px) { .body { grid-template-columns: 1fr; } .cards { max-height: 30vh; } }
</style>
