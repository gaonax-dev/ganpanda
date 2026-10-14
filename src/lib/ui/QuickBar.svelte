<!--
  휴대폰 폭 빠른 막대 (2026-10-15 사용자: "모바일에서는 사인물을 선택하면 하단에 1개의 셀렉터(종류 선택), 2개의 버튼 간단 입력(사인물 네임, 사이즈), 상세정보를 둔다")
  · 종류 셀렉터(간판·스카시 제품 / 시트) · [이름] [사이즈] 버튼 → 아래 줄에 간단 입력 · [상세정보] → 전체 패널
  배경: 현장에서는 휴대폰으로 치수만 넣고 나머지는 데스크톱에서 (2026-10-14)
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { CATEGORY_GROUPS, SHEETS, categoryOf, groupOfProduct, productsOf, productById, sheetById } from '../core/catalog';
  import type { SignObject } from '../core/model';

  let { obj }: { obj: SignObject } = $props();

  const ro = $derived(!app.canEdit);
  const m = $derived(app.measures.get(obj.id));
  /** 같은 사진의 사인물 (왼쪽부터, 순서대로 돌며 치수 입력) */
  const siblings = $derived(app.photoSigns(obj.photoId));
  const idx = $derived(siblings.findIndex((o) => o.id === obj.id));
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)));
  const update = (patch: Partial<SignObject>) => { if (app.canEdit) app.project.updateObject(obj.id, patch); };

  /** 열린 간단 입력: 이름 또는 사이즈 */
  let editing: 'name' | 'size' | null = $state(null);
  let nameDraft = $state('');
  function openName() { nameDraft = obj.name; editing = editing === 'name' ? null : 'name'; }
  function saveName() { const n = nameDraft.trim(); if (n && n !== obj.name) update({ name: n }); editing = null; }
  function step(d: number) {
    if (!siblings.length) return;
    app.selectObject(siblings[(idx + d + siblings.length) % siblings.length].id);
  }

  /** 종류 셀렉터 값: 제품 id, 시트면 'sheet:<id>', 없으면 '' */
  const kind = $derived(obj.productId ? obj.productId : obj.sheetIds.length ? `sheet:${obj.sheetIds[0]}` : '');
  /** 분류(간판/스카시/시트)가 바뀌는 선택은 확인을 거친다 (패널과 같은 규칙) */
  let pendingKind: string | null = $state(null);
  const groupOfKind = (v: string) => (v.startsWith('sheet:') ? 'sheet' : groupOfProduct(v));
  function setKind(v: string) {
    if (!v) return;
    const cur = categoryOf(obj);
    if (cur !== null && groupOfKind(v) !== cur) { pendingKind = v; return; }
    applyKind(v);
  }
  function applyKind(v: string) {
    const changed = categoryOf(obj) !== groupOfKind(v);
    if (v.startsWith('sheet:')) update({ productId: undefined, sheetIds: [v.slice(6)], ...(changed ? { options: undefined } : {}) });
    else update({ productId: v, ...(changed ? { options: undefined } : {}) });
    pendingKind = null;
  }
  const kindName = (v: string) => (v.startsWith('sheet:') ? sheetById(v.slice(6))?.name : productById(v)?.name) ?? v;
  const isBoard = $derived(productById(obj.productId)?.category === 'board');
  const sizeLabel = $derived(obj.widthMm && obj.heightMm ? `${fmt(obj.widthMm)}×${fmt(obj.heightMm)}${obj.depthMm ? `×${fmt(obj.depthMm)}` : ''}` : m?.estimate ? `≈${fmt(m.estimate.widthMm)}×${fmt(m.estimate.heightMm)}` : '사이즈');
  const kindLabel = (g: string) => CATEGORY_GROUPS.find((c) => c.id === g)?.label ?? g;
</script>

<div class="quick" data-testid="quick-bar">
  <div class="row">
    <select class="kind" data-testid="quick-kind" value={pendingKind ?? kind} disabled={ro} onchange={(e) => setKind(e.currentTarget.value)}>
      <option value="" disabled>종류 선택</option>
      <optgroup label={kindLabel('sign')}>{#each productsOf('sign') as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</optgroup>
      <optgroup label={kindLabel('scashi')}>{#each productsOf('scashi') as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</optgroup>
      <optgroup label={kindLabel('sheet')}>{#each SHEETS as s (s.id)}<option value="sheet:{s.id}">{s.name}</option>{/each}</optgroup>
    </select>
    <button class="btn small val" class:on={editing === 'name'} data-testid="quick-name" title="이름" onclick={openName}>{obj.name}</button>
    <button class="btn small val" class:on={editing === 'size'} data-testid="quick-size" title="사이즈 (mm)" onclick={() => (editing = editing === 'size' ? null : 'size')}>{sizeLabel}</button>
    <button class="btn small primary" data-testid="quick-panel-open" onclick={() => (app.panelOpen = true)}>상세정보</button>
  </div>
  {#if pendingKind}
    <div class="row confirm" data-testid="category-confirm">
      <p>분류가 바뀝니다 (→ {kindName(pendingKind)}). 종류·옵션이 초기화되고 모두에게 적용됩니다.</p>
      <button class="btn small primary" data-testid="category-confirm-ok" onclick={() => applyKind(pendingKind!)}>바꾸기</button>
      <button class="btn small" data-testid="category-confirm-cancel" onclick={() => (pendingKind = null)}>취소</button>
    </div>
  {/if}
  {#if editing === 'name'}
    <form class="row edit" data-testid="quick-name-edit" onsubmit={(e) => { e.preventDefault(); saveName(); }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input data-testid="quick-name-input" bind:value={nameDraft} disabled={ro} placeholder="사인물 이름" autofocus onblur={saveName} />
      <button class="btn small" type="submit">확인</button>
    </form>
  {:else if editing === 'size'}
    <div class="row edit" data-testid="quick-size-edit">
      <button class="icon" data-testid="quick-prev" title="이전 사인물" disabled={siblings.length < 2} onclick={() => step(-1)}>‹</button>
      <small>{idx + 1}/{siblings.length}</small>
      <!-- svelte-ignore a11y_autofocus -->
      <input data-testid="quick-width" type="number" inputmode="decimal" min="0" step="10" value={obj.widthMm ?? ''} disabled={ro} autofocus
        placeholder={m?.estimate ? `≈${fmt(m.estimate.widthMm)}` : '가로'} oninput={(e) => update({ widthMm: num(e.currentTarget.value) })} />
      <span>×</span>
      <input data-testid="quick-height" type="number" inputmode="decimal" min="0" step="10" value={obj.heightMm ?? ''} disabled={ro}
        placeholder={m?.estimate ? `≈${fmt(m.estimate.heightMm)}` : '세로'} oninput={(e) => update({ heightMm: num(e.currentTarget.value) })} />
      {#if isBoard}
        <span>×</span>
        <input data-testid="quick-depth" type="number" inputmode="decimal" min="0" step="10" value={obj.depthMm ?? ''} disabled={ro} placeholder="두께"
          oninput={(e) => update({ depthMm: num(e.currentTarget.value) })} />
      {/if}
      <span>mm</span>
      <button class="icon" data-testid="quick-next" title="다음 사인물" disabled={siblings.length < 2} onclick={() => step(1)}>›</button>
    </div>
  {/if}
  {#if !obj.productId && obj.sheetIds.length > 1}<small class="hint">시트 {obj.sheetIds.map((id) => sheetById(id)?.name ?? id).join(', ')}</small>{/if}
</div>

<style>
  .quick {
    position: absolute; left: 8px; right: 8px; bottom: 66px; z-index: 5;
    display: flex; flex-direction: column; gap: 6px; padding: 6px 8px; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }
  .row { display: flex; align-items: center; gap: 4px; }
  .kind { flex: 1 1 90px; min-width: 0; width: auto; padding: 6px 6px; font-size: 12px; }
  .val { max-width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
  .val.on { border-color: var(--accent); color: var(--accent); }
  .edit input { flex: 1; min-width: 0; padding: 6px 6px; font-size: 13px; }
  .edit input[type='number'] { text-align: right; }
  .edit small, .edit span { color: var(--muted); font-size: 11px; white-space: nowrap; }
  .hint { color: var(--muted); font-size: 11px; }
  .confirm { flex-wrap: wrap; padding: 6px 8px; border-radius: 8px; background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); font-size: 12px; }
  .confirm p { margin: 0; flex-basis: 100%; line-height: 1.4; }
  .icon { padding: 4px 6px; font-size: 18px; line-height: 1; }
</style>
