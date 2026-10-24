<!--
  휴대폰 폭 빠른 막대 (2026-10-15 사용자: "모바일에서는 사인물을 선택하면 하단에 1개의 셀렉터(종류 선택), 2개의 버튼 간단 입력(사인물 네임, 사이즈), 상세정보를 둔다")
  · 종류 셀렉터(간판 / 스카시 / 시트 — 세부 제품은 상세정보에서) · [이름] [사이즈] 버튼 → 아래 줄에 간단 입력 · [상세정보] → 전체 패널
  배경: 현장에서는 휴대폰으로 치수만 넣고 나머지는 데스크톱에서 (2026-10-14)
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { categoryPatch } from '../core/parts';
  import { CATEGORY_GROUPS, categoryOf, defaultProductFor, productById, sheetById, type Group } from '../core/catalog';
  import type { SignObject } from '../core/model';
  import QuickSpec from './QuickSpec.svelte';
  import SpecInput from './SpecInput.svelte';
  import TemplateQuick from './TemplateQuick.svelte';

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
  /** 종류 = 분류(간판/스카시/시트)만 (2026-10-15 사용자: "모바일의 종류 선택은 간판, 스카시, 시트. 현재 내역(제품 목록)은 간판 상세에").
   *  처음 선택은 바로, 이미 분류가 있으면 확인을 거친다 (패널과 같은 규칙) */
  const category = $derived(categoryOf(obj));
  let pending: Group | null = $state(null);
  function pickCategory(g: Group | '') {
    if (!g || g === category) return;
    if (category === null) { apply(g); return; }
    pending = g;
  }
  function apply(g: Group) {
    // 시트는 제품 없이 시트 컷팅으로 시작(시트가 하나도 없으면 분류가 비어 보이므로), 나머지는 분류 기본 제품. 옵션은 비운다
    update(categoryPatch(obj, g, defaultProductFor(g))); // 못 붙는 구성 요소는 정리 (2026-10-16 모든 분류 조합형)
    pending = null;
  }
  // 다중 선택 모드 (2026-10-19 사용자: "하단의 기능은 종류선택만 보이고 한번에 종류 선택 및 변경"): 셀렉터 값은 모두 같은 분류일 때만, 이미 분류가 있는 것이 바뀌면 확인
  const selObjs = $derived(app.multiMode ? app.selectionIds.map((id) => app.objects.find((o) => o.id === id)).filter((o): o is SignObject => !!o) : []);
  const multiCategory = $derived.by(() => { const cs = new Set(selObjs.map((o) => categoryOf(o))); return cs.size === 1 ? [...cs][0] : null; });
  let multiPending: Group | null = $state(null);
  function pickMulti(g: Group | '') {
    if (!g || g === multiCategory) return;
    if (selObjs.every((o) => categoryOf(o) === null || categoryOf(o) === g)) { app.applyCategoryToSelection(g); return; }
    multiPending = g;
  }
  const label = (g: Group | null) => CATEGORY_GROUPS.find((c) => c.id === g)?.label ?? '없음';
  const sizeLabel = $derived(obj.widthMm && obj.heightMm ? `${fmt(obj.widthMm)}×${fmt(obj.heightMm)}` : m?.estimate ? `≈${fmt(m.estimate.widthMm)}×${fmt(m.estimate.heightMm)}` : '사이즈');
</script>

<div class="quick" class:ro data-ro={ro || undefined} data-testid="quick-bar">
  {#if app.multiMode}
  <div class="row">
    <span class="cnt" data-testid="quick-multi-count">{app.selectionIds.length}개 선택</span>
    <select class="kind" data-testid="quick-kind" value={multiPending ?? multiCategory ?? ''} disabled={ro} onchange={(e) => pickMulti(e.currentTarget.value as Group | '')}>
      <option value="" disabled>종류 선택</option>
      {#each CATEGORY_GROUPS as g (g.id)}<option value={g.id}>{g.label}</option>{/each}
    </select>
  </div>
  {#if multiPending}
    <div class="row confirm" data-testid="category-confirm">
      <p>선택한 {selObjs.length}개를 <b>{label(multiPending)}</b>(으)로 바꾸면 분류가 다른 사인물은 종류·옵션이 초기화되고 모두에게 적용됩니다.</p>
      <button class="btn small primary" data-testid="category-confirm-ok" onclick={() => { app.applyCategoryToSelection(multiPending!); multiPending = null; }}>바꾸기</button>
      <button class="btn small" data-testid="category-confirm-cancel" onclick={() => (multiPending = null)}>취소</button>
    </div>
  {/if}
  {:else}
  <div class="row">
    <select class="kind" data-testid="quick-kind" value={pending ?? category ?? ''} disabled={ro} onchange={(e) => pickCategory(e.currentTarget.value as Group | '')}>
      <option value="" disabled>종류 선택</option>
      {#each CATEGORY_GROUPS as g (g.id)}<option value={g.id}>{g.label}</option>{/each}
    </select>
    <button class="btn small val" class:on={editing === 'name'} data-testid="quick-name" title="이름" onclick={openName}>{obj.name}</button>
    <button class="btn small val" class:on={editing === 'size'} class:need={!obj.widthMm || !obj.heightMm} data-need={!obj.widthMm || !obj.heightMm ? '1' : undefined} data-testid="quick-size" title="사이즈 (mm)" onclick={() => (editing = editing === 'size' ? null : 'size')}>{sizeLabel}</button>
    <!-- 말풍선 단추는 상단 메뉴(mobile-chat)로 옮김 (2026-10-18 "말풍선도 여기로 이동") -->
    <button class="btn small primary" data-testid="quick-panel-open" onclick={() => (app.panelOpen = true)}>상세정보</button>
  </div>
  {#if pending}
    <div class="row confirm" data-testid="category-confirm">
      <p>분류를 <b>{label(category)} → {label(pending)}</b> 로 바꾸면 종류·옵션이 초기화되고 모두에게 적용됩니다.</p>
      <button class="btn small primary" data-testid="category-confirm-ok" onclick={() => apply(pending!)}>바꾸기</button>
      <button class="btn small" data-testid="category-confirm-cancel" onclick={() => (pending = null)}>취소</button>
    </div>
  {/if}
  {#if category && !pending}<TemplateQuick {obj} {ro} {update} compact />{/if}
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
      <span>mm</span>
      <button class="icon" data-testid="quick-next" title="다음 사인물" disabled={siblings.length < 2} onclick={() => step(1)}>›</button>
    </div>
  {/if}
  <!-- 퀵입력 (2026-10-18 사용자: "하단 정보창에는 퀵입력 나오게"): 사양 글 → 확인 → 적용 -->
  {#if !ro}<SpecInput {obj} {ro} {update} />{/if}
  <!-- 빠른 설정 칩 (2026-10-17): 몸통·채널·LED — 휴대폰에서도 설정 창 없이 -->
  <QuickSpec {obj} {ro} {update} compact onPick={(tab) => { app.objectSettingsFocus = tab; app.panelOpen = true; app.objectSettingsOpen = true; }} />
  {#if obj.productId || obj.sheetIds.length}<small class="hint" data-testid="quick-detail">{productById(obj.productId)?.name ?? obj.sheetIds.map((id) => sheetById(id)?.name ?? id).join(', ')} — 세부 종류·옵션은 [상세정보]</small>{/if}
  {/if}
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
  .val.need { outline: 2px solid var(--accent); outline-offset: 1px; color: var(--muted); } /* 치수 없음 — 강조 테두리, 예상(≈)은 회색 (2026-10-24) */
  .edit input { flex: 1; min-width: 0; padding: 6px 6px; font-size: 13px; }
  .edit input[type='number'] { text-align: right; }
  .edit small, .edit span { color: var(--muted); font-size: 11px; white-space: nowrap; }
  .cnt { font-size: 12px; color: var(--accent); font-weight: 700; white-space: nowrap; padding: 0 4px; }
  .hint { color: var(--muted); font-size: 11px; }
  .confirm { flex-wrap: wrap; padding: 6px 8px; border-radius: 8px; background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); font-size: 12px; }
  .confirm p { margin: 0; flex-basis: 100%; line-height: 1.4; }
  .icon { padding: 4px 6px; font-size: 18px; line-height: 1; }
</style>
