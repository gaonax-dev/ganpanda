<!--
  간판 속성 (2026-10-31 사용자: "현재 사인물 설정이 많이 복잡해 … 현재 오브젝트를 조합한 3d 뷰가 최상단에 놓인다. 하단에 배치버튼으로 레이아웃 조정(이때 위의 뷰어는 그대로 있고
  내용만 레이아웃 용으로 변경 · 배치버튼 아래에 현재 구성된 내용을 단으로 보여준다. 프레임이 최하단 그 윗단에 프레임에 붙는 요소를 나열한다. 해당 요소를 클릭하면 뷰어에 단일 요소만
  남기고 쓱사라지면서 화면에 클로즈업한다. 이때 배치버튼 구성 단들은 사라지고 해당 요소를 선택할 수 있는 고르기 버튼과 해당 사인물의 마지막에 글,그림,path(디자이너용), gltf(디자이너용)
  … 색상을 개별구성에서 선택하지 않고 전체 사인물이 공유" → "우선 설명한 부분만 화면에 구성하는 미니멀 전략으로 진행해줘").
  미니멀: 뷰어 · [배치] · 단(위 → 아래, 프레임이 맨 아래) · 요소 클로즈업(고르기 · 프로젝트 컬러 칸 · 글/그림/path/gltf). 나머지 설정은 아래 "세부 설정"
-->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { Snippet } from 'svelte';
  import { app } from '../state.svelte';
  import type { SignObject, SignPart } from '../core/model';
  import { asDesigned, commitParts, newItem, newPart, partKindsFor, partLabel, partsForProduct, partsOf } from '../core/parts';
  import { componentOf } from '../core/components';
  import { applyPreset } from '../core/partPresets';
  import { categoryOf, productById, productsOf, signParts } from '../core/catalog';
  import { activeSet, colorPatch, slotOfOptions } from '../core/projectColors';
  import { kitLookFor, kitVariantFor } from '../core/channelKit';
  import { cardKey, kitCards } from '../render/kitCards.svelte';
  import SignView3D from './SignView3D.svelte';
  import FrontEditor from './FrontEditor.svelte';
  import { layersOf, lockedItemIds } from '../core/layers';
  import type { PartItem } from '../core/model';

  let { obj: own, layout }: { obj: SignObject; layout?: Snippet } = $props();
  // 제안 내용 ↔ 디자인 내용 (2026-11-08 "제안은 텍스트와 지정컬러가 디자인은 pdf에서 가져온 페스와 디자인으로 각각 보여야한다"): 상단 탭을 따른다 —
  // 디자인 탭(·고객)이고 디자인 내용(designItems)이 있으면 디자인 내용(보기 전용, 내용은 디자인 싱크로 받는다 · [디자인 내용 지우기]), 아니면 제안 내용.
  // 속성 창 안의 [제안 | 디자인] 전환은 없앰 (같은 날 "[제안 | 디자인] 없이 상단 탭 변경에 따라 별도 표시")
  const hasDesign = $derived(!!own.designItems && Object.keys(own.designItems).length > 0);
  const showDesign = $derived(hasDesign && app.designView);
  const obj = $derived(showDesign ? asDesigned(own) : own);
  const ro = $derived(!app.canEdit || showDesign);
  const update = (patch: Partial<SignObject>) => { if (ro) return; app.editBoundary(); app.project.updateObject(obj.id, patch); app.editBoundary(); };
  const parts = $derived(partsOf(obj));
  const editParts = (fn: (ps: SignPart[]) => void) => { const ps: SignPart[] = JSON.parse(JSON.stringify(parts)); fn(ps); update(commitParts(obj, ps)); };
  // 배치 (정면도 편집기) — 패널 안에서도 쓰도록 여기서 가진다 (2026-10-31 "해당 위치로 변경해줘": 간판 속성이 패널로)
  let layoutSel = $state<{ part: string; item: string } | null>(null);
  const lockedIds = $derived(lockedItemIds(layersOf(obj, parts)));
  const setItemById = (partId: string, itemId: string, patch: Partial<PartItem>) => editParts((ps) => { const it = ps.find((x) => x.id === partId)?.items.find((x) => x.id === itemId); if (it) Object.assign(it, patch); });

  let mode = $state<'overview' | 'layout'>('overview');
  /** 클로즈업한 요소: 'frame' 또는 구성 요소 id */
  let focus = $state<string | null>(null);
  const focused = $derived(focus && focus !== 'frame' ? parts.find((p) => p.id === focus) ?? null : null);
  $effect(() => { if (focus && focus !== 'frame' && !focused) focus = null; }); // 지운 요소

  // 단: 프레임(맨 아래) → 프레임에 붙는 것(채널·스카시·프레임 면 시트) → 그 위에 올린 시트
  const frame = $derived(productById(signParts(obj).bodyId));
  // 다른 요소 위에 올라간 것(sits + on)은 윗단, 나머지는 프레임에 붙는 단 — 종류 이름이 아니라 레지스트리(sits)로
  const isUpper = (p: SignPart) => componentOf(p.kind).sits && !!p.on && p.on !== 'frame';
  const onFrame = $derived(parts.filter((p) => !isUpper(p)));
  const upper = $derived(parts.filter(isUpper));
  const tiers = $derived([upper, onFrame].filter((t) => t.length));
  const textOf = (p: SignPart) => { const t = p.items.filter((i) => i.kind === 'text' && i.text?.trim()).map((i) => i.text!.trim()).join(' '); const v = p.items.filter((i) => i.vector).length; return t ? `"${t}"` : v ? `PDF 패스 ${v}` : ''; };

  // 색: 요소마다 칠하는 면 — 프로젝트 컬러 칸에서 고른다
  const FRAME_ROLES: [string, string][] = [['face', '바탕'], ['framePaint', '테']];
  const set = $derived(activeSet(app.projectColors));
  const slots = $derived(set?.slots ?? []);
  const anyColor = $derived(slots.some((s) => !!s.hex));
  const optsOf = () => (focus === 'frame' ? obj.options ?? {} : focused?.options ?? {});
  const rolesOf = () => (focus === 'frame' ? FRAME_ROLES : focused ? componentOf(focused.kind).colorRoles ?? [] : []);
  function paint(prefix: string, slotId: string) {
    const patch = colorPatch(prefix, app.projectColors, slotId);
    if (focus === 'frame') update({ options: { ...(obj.options ?? {}), ...patch } });
    else if (focused) editParts((ps) => { const p = ps.find((x) => x.id === focused!.id)!; p.options = { ...(p.options ?? {}), ...patch }; });
  }

  // 고르기: 채널은 그림 카드(키트), 그 밖은 세부 종류, 프레임은 몸통 종류
  let picking = $state(false);
  const category = $derived(categoryOf(obj));
  const kitCardOf = (pr: { type: string; options: Record<string, unknown> }) => { const v = kitVariantFor(pr); return v ? kitCards[cardKey({ variant: v, look: kitLookFor(pr) })] : undefined; };

  function addItem(kind: 'text' | 'image') {
    if (!focused) return;
    editParts((ps) => { const p = ps.find((x) => x.id === focused!.id)!; const it = newItem(kind); if (kind === 'text') it.text = '글자'; p.items.push(it); });
  }
  const back = () => { focus = null; picking = false; item = null; };

  // 레이어 (2026-11-10 사용자: "하단이 레이어로 마치게 그리고 레이어에 [+] 마크로 추가 가능하고 레이어 상단에 빈레이어 그리고 해당 레이어의 아이탬을 선택하면 글로즈업하고 하단에 해당 속성만 나오게")
  /** 고른 객체 (구성 요소 안의 글자·그림·패스) — 그 객체만 클로즈업, 아래는 그 객체 속성만 */
  let item = $state<string | null>(null);
  const focusedItem = $derived(item && focused ? focused.items.find((i) => i.id === item) ?? null : null);
  $effect(() => { if (item && !focusedItem) item = null; }); // 지운 객체
  const pickItem = (partId: string, itemId: string) => { focus = partId; item = itemId; picking = false; };
  const kinds = $derived(partKindsFor(obj));
  let adding = $state(false);
  /** 빈 레이어를 맨 위에 — 종류가 하나면 바로, 여럿이면 고른 종류로. 만들면 그 레이어를 클로즈업(고르기·글/그림 추가) */
  function addLayer(kind: SignPart['kind']) {
    const p = newPart(kind);
    editParts((ps) => { ps.unshift(p); });
    adding = false; focus = p.id; item = null;
  }
  const itemName = (i: PartItem) => i.kind === 'text' ? (i.text?.trim() || '빈 글자') : i.vector ? 'PDF 패스' : i.kind === 'image' ? (i.image && 'name' in i.image && i.image.name ? i.image.name : '그림') : '도형';
  const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

  // PDF 레이어 연결 (2026-11-12 사용자: "디자인 파일 연결을 싱크에서 연결한 이후에 레이어 설정에 접근하는 방법이 없다"): 디자인 싱크에서 고른 레이어 → 구성물 연결을
  // 확정한 뒤에도 여기서 — 원본 PDF 에서 레이어를 다시 꺼내 고르고 [적용]하면 디자인 내용·사진보드용 입체 제외 그림을 다시 짓는다
  const pdfSource = $derived(own.design ? app.sources.find((x) => x.id === own.design!.sourceId && x.kind === 'pdf') : undefined);
  const canRelink = $derived(!!pdfSource && app.canEdit && !app.isCustomer);
  let pdfOpen = $state(false);
  let pdfBusy = $state(false);
  let pdfLayers = $state<{ name: string; paths: number; texts: number }[] | null>(null);
  let pdfSel = $state<Record<string, string>>({});
  const extrudeParts = $derived(partsOf(own).filter((p) => componentOf(p.kind).extrude));
  async function openPdfLayers() {
    if (pdfOpen) { pdfOpen = false; return; }
    pdfOpen = true; pdfLayers = null;
    const ls = await app.designLayersOf(own.id);
    pdfLayers = ls ?? [];
    pdfSel = Object.fromEntries(pdfLayers.map((l) => { const v = own.layerLinks?.[l.name]; return [l.name, v !== undefined && (v === '' || extrudeParts.some((p) => p.id === v)) ? v : '']; }));
  }
  async function applyPdfLayers() {
    pdfBusy = true;
    try { await app.relinkDesignLayers(own.id, { ...pdfSel }); pdfOpen = false; } finally { pdfBusy = false; }
  }
  const setItem = (patch: Partial<PartItem>) => { if (focused && focusedItem) setItemById(focused.id, focusedItem.id, patch); };
  function deleteItem() { if (!focused || !focusedItem) return; const pid = focused.id, iid = focusedItem.id; editParts((ps) => { const p = ps.find((x) => x.id === pid)!; p.items = p.items.filter((x) => x.id !== iid); }); item = null; }
</script>

<section class="props" data-testid="sign-props" data-mode={focus ? 'focus' : mode} data-side={showDesign ? 'design' : 'propose'}>
  {#if showDesign}
    <div class="side" data-testid="sign-side">
      <small>디자인 내용 — 디자인 싱크로 받은 PDF 패스 · 보기 전용</small>
      {#if app.canEdit && !app.isCustomer}<button class="btn small" data-testid="sign-design-clear" title="디자인 내용을 지우면 디자인 탭도 제안 내용으로" onclick={() => app.clearDesignItems(own.id)}>디자인 내용 지우기</button>{/if}
    </div>
  {/if}
  <div class="viewer" data-testid="sign-props-viewer">
    <!-- 3D 뷰어는 늘 붙어 있다 — 요소를 고르거나 배치로 바꿀 때 다시 만들지 않는다(다시 만들면 카메라가 다가가는 대신 화면이 새로 그려져 "리프레시"처럼 보였다, 2026-10-31).
         같은 사인물 3D 에서 고른 요소만 남기고 가까이 (키트 G 모델은 고르기 카드에만) -->
    <div class="slot" style:visibility={mode === 'layout' && !focus ? 'hidden' : 'visible'}>
      <SignView3D {obj} closeUp={!!focus} focusPart={focus} focusItem={item} />
    </div>
    {#if mode === 'layout' && !focus}
      <div class="slot layout" data-testid="sign-props-layout" in:scale={{ start: 0.96, duration: 220 }} out:fade={{ duration: 160 }}>{#if layout}{@render layout()}{:else}<FrontEditor {obj} {parts} {ro} bind:sel={layoutSel} setItem={setItemById} locked={lockedIds} />{/if}</div>
    {/if}
  </div>

  {#if !focus}
    <button class="btn small" class:on={mode === 'layout'} data-testid="sign-props-layout-toggle" onclick={() => (mode = mode === 'layout' ? 'overview' : 'layout')}>{mode === 'layout' ? '배치 끝' : '배치'}</button>
    <div class="layers-head">
      <b>레이어</b>
      {#if canRelink}<button class="btn small" class:on={pdfOpen} data-testid="sign-pdf-layers" title="디자인 싱크로 받은 PDF 의 레이어를 어느 구성물(입체)로 쓸지 다시 고르기" onclick={openPdfLayers}>PDF 레이어</button>{/if}
      {#if !ro && kinds.length}<button class="icon add" data-testid="sign-layer-add" title="빈 레이어를 맨 위에" onclick={() => { if (kinds.length === 1) addLayer(kinds[0]); else adding = !adding; }}>＋</button>{/if}
    </div>
    {#if pdfOpen}
      <div class="pdf" data-testid="pdf-layers">
        {#if pdfLayers === null}<small class="hint">원본 PDF 에서 레이어를 읽는 중…</small>
        {:else if !pdfLayers.length}<small class="hint">이 디자인 파일에는 레이어가 없습니다 (원본 PDF 가 없거나 레이어 없이 저장됨).</small>
        {:else}
          {#each pdfLayers as l (l.name)}
            <label class="prow" data-testid="pdf-layer-row" data-layer={l.name}>
              <span class="lname">{l.name}<small>{l.paths ? `패스 ${l.paths}` : l.texts ? '글자만 — 윤곽선 만들기 필요' : '비어 있음'}</small></span>
              <select value={pdfSel[l.name] ?? ''} disabled={!l.paths || pdfBusy} onchange={(e) => (pdfSel = { ...pdfSel, [l.name]: e.currentTarget.value })}>
                <option value="">입체 안 함</option>
                {#each extrudeParts as p (p.id)}<option value={p.id}>{partLabel(p)}</option>{/each}
              </select>
            </label>
          {/each}
          <div class="row">
            <button class="btn small primary" data-testid="pdf-layers-apply" disabled={pdfBusy} onclick={applyPdfLayers}>{pdfBusy ? '적용 중…' : '적용'}</button>
            <button class="btn small" data-testid="pdf-layers-close" disabled={pdfBusy} onclick={() => (pdfOpen = false)}>닫기</button>
          </div>
        {/if}
      </div>
    {/if}
    {#if adding}
      <div class="kinds" data-testid="sign-layer-kinds">
        {#each kinds as k (k)}<button class="opt" data-testid="sign-layer-kind" data-kind={k} style:--c={componentOf(k).color} onclick={() => addLayer(k)}>{componentOf(k).label}</button>{/each}
      </div>
    {/if}
    <div class="tiers" data-testid="sign-tiers">
      {#each tiers as tier, ti (ti)}
        <div class="tier" data-testid="sign-tier">
          {#each tier as p (p.id)}
            <div class="layer">
              <button class="el" data-testid="sign-el" data-kind={p.kind} style:--c={componentOf(p.kind).color} onclick={() => { focus = p.id; item = null; }}>
                <b>{partLabel(p)}</b>{#if textOf(p)}<small>{textOf(p)}</small>{:else if !p.items.length}<small>빈 레이어</small>{/if}
              </button>
              {#each p.items as it (it.id)}
                <button class="it" data-testid="sign-item" data-kind={it.kind} onclick={() => pickItem(p.id, it.id)}>{itemName(it)}</button>
              {/each}
            </div>
          {/each}
        </div>
      {/each}
      <div class="tier frame">
        <button class="el" data-testid="sign-el-frame" onclick={() => { focus = 'frame'; item = null; }}><b>{frame && frame.id !== 'body-none' ? frame.name : '프레임 없음'}</b><small>프레임</small></button>
      </div>
    </div>
  {:else if focusedItem && focused}
    <!-- 객체 하나: 그 객체만 클로즈업, 속성도 그것만 -->
    <div class="focus" data-testid="sign-item-focus" transition:fade={{ duration: 180 }}>
      <div class="row">
        <button class="btn small" data-testid="sign-item-back" onclick={() => (item = null)}>← {partLabel(focused)}</button>
        <b>{itemName(focusedItem)}</b>
        {#if !ro}<button class="icon" data-testid="sign-item-delete" title="이 객체 지우기" onclick={deleteItem}>🗑</button>{/if}
      </div>
      <div class="fields">
        {#if focusedItem.kind === 'text'}<label class="wide">글자<input data-testid="sign-item-text" value={focusedItem.text ?? ''} disabled={ro} oninput={(e) => setItem({ text: e.currentTarget.value })} /></label>{/if}
        <label>높이<input type="number" data-testid="sign-item-h" value={Math.round(focusedItem.h)} disabled={ro} oninput={(e) => setItem({ h: num(e.currentTarget.value) })} /></label>
        {#if focusedItem.w !== undefined}<label>가로<input type="number" data-testid="sign-item-w" value={Math.round(focusedItem.w)} disabled={ro} oninput={(e) => setItem({ w: num(e.currentTarget.value) || undefined })} /></label>{/if}
        <label>X<input type="number" data-testid="sign-item-x" value={Math.round(focusedItem.x)} disabled={ro} oninput={(e) => setItem({ x: num(e.currentTarget.value) })} /></label>
        <label>Y<input type="number" data-testid="sign-item-y" value={Math.round(focusedItem.y)} disabled={ro} oninput={(e) => setItem({ y: num(e.currentTarget.value) })} /></label>
        <span class="unit">mm</span>
      </div>
    </div>
  {:else}
    <div class="focus" data-testid="sign-focus" transition:fade={{ duration: 180 }}>
      <div class="row">
        <button class="btn small" data-testid="sign-focus-back" onclick={back}>← 전체</button>
        <b>{focus === 'frame' ? (frame?.name ?? '프레임') : focused ? partLabel(focused) : ''}</b>
        {#if !ro}<button class="btn small primary" data-testid="sign-pick" onclick={() => (picking = !picking)}>{picking ? '고르기 닫기' : '고르기'}</button>{/if}
      </div>
      {#if picking}
        <div class="pick" data-testid="sign-pick-list">
          {#if focus === 'frame' && category}
            {#each productsOf(category) as pr (pr.id)}
              <button class="opt" class:on={pr.id === frame?.id} data-testid="sign-pick-opt" onclick={() => { update({ productId: pr.id, parts: partsForProduct(obj, pr.id) }); picking = false; }}>{pr.name}</button>
            {/each}
          {:else if focused && componentOf(focused.kind).presets?.length}
            {#each componentOf(focused.kind).presets ?? [] as pr (pr.no)}
              <button class="card" data-testid="sign-pick-opt" title={pr.desc} onclick={() => { editParts((ps) => { const i = ps.findIndex((x) => x.id === focused!.id); ps[i] = applyPreset(ps[i], pr, obj); }); picking = false; }}>
                <img src={kitCardOf(pr) ?? pr.img} alt="" width="96" height="64" /><span>{pr.label}</span>
              </button>
            {/each}
          {:else if focused}
            {#each componentOf(focused.kind).types as t (t.id)}
              <button class="opt" class:on={t.id === focused.type} data-testid="sign-pick-opt" onclick={() => { editParts((ps) => { const p = ps.find((x) => x.id === focused!.id)!; p.type = t.id; p.options = {}; }); picking = false; }}>{t.label}</button>
            {/each}
          {/if}
        </div>
      {/if}
      {#if rolesOf().length}
        <div class="colors" data-testid="sign-colors">
          {#if !anyColor}
            <p class="hint">색은 사인물 전체가 프로젝트 컬러를 함께 씁니다 — 먼저 메인·배경·포인트를 정하세요.</p>
            <button class="btn small" data-testid="sign-colors-setup" onclick={() => (app.colorsOpen = true)}>프로젝트 컬러 정하기</button>
          {:else}
            {#each rolesOf() as [prefix, label] (prefix)}
              <div class="crow" data-testid="sign-color-row" data-prefix={prefix}>
                <span class="lab">{label}</span>
                {#each slots.filter((s) => s.hex) as s (s.id)}
                  <button class="slot-chip" class:on={slotOfOptions(optsOf(), prefix) === s.id} data-testid="sign-color-slot" data-slot={s.id} disabled={ro} title={`${s.name}${s.label ? ` · ${s.label}` : ''}`} onclick={() => paint(prefix, s.id)}>
                    <i style:background={s.hex}></i>{s.name}
                  </button>
                {/each}
              </div>
            {/each}
            <button class="link" data-testid="sign-colors-edit" onclick={() => (app.colorsOpen = true)}>프로젝트 컬러 고치기</button>
          {/if}
        </div>
      {/if}
      {#if focused?.items.length}
        <div class="items" data-testid="sign-focus-items">
          {#each focused.items as it (it.id)}<button class="it" data-testid="sign-item" data-kind={it.kind} onclick={() => pickItem(focused!.id, it.id)}>{itemName(it)}</button>{/each}
        </div>
      {/if}
      {#if focused && !ro}
        <div class="items" data-testid="sign-items">
          <button class="btn small" data-testid="sign-add-text" onclick={() => addItem('text')}>＋ 글</button>
          <button class="btn small" data-testid="sign-add-image" onclick={() => addItem('image')}>＋ 그림</button>
          <button class="btn small" disabled title="디자이너용 — 준비 중">＋ path</button>
          <button class="btn small" disabled title="디자이너용 — 준비 중">＋ gltf</button>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .props { display: flex; flex-direction: column; gap: 8px; }
  .viewer { position: relative; width: 100%; aspect-ratio: 16 / 10; border-radius: 10px; overflow: hidden; background: #cfdbe8; }
  .slot { position: absolute; inset: 0; }
  .layout { overflow: auto; background: var(--panel); }
  .tiers { display: flex; flex-direction: column; gap: 6px; }
  .tier { display: flex; gap: 6px; flex-wrap: wrap; padding: 6px; border-radius: 8px; background: var(--hover); }
  .tier.frame { background: color-mix(in srgb, var(--hover) 60%, #000); }
  .el { display: flex; flex-direction: column; align-items: flex-start; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); border-left: 4px solid var(--c, var(--muted)); background: var(--panel); color: var(--text); text-align: left; }
  .el small { color: var(--muted); }
  .focus { display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row b { flex: 1; }
  .pick { display: flex; gap: 6px; flex-wrap: wrap; }
  .opt { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--text); }
  .opt.on { border-color: var(--accent); }
  .card { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font-size: 11px; }
  .card img { border-radius: 6px; object-fit: cover; }
  .colors { display: flex; flex-direction: column; gap: 6px; }
  .crow { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .lab { width: 3em; color: var(--muted); font-size: 12px; }
  .slot-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font-size: 12px; }
  .slot-chip.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .slot-chip i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--line); }
  .link { align-self: flex-start; background: none; border: 0; color: var(--muted); text-decoration: underline; padding: 0; font-size: 12px; }
  .items { display: flex; gap: 6px; flex-wrap: wrap; }
  .layers-head { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .layers-head b { flex: 1; font-size: 13px; }
  .add { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font-size: 16px; line-height: 1; }
  .kinds { display: flex; gap: 6px; flex-wrap: wrap; }
  .pdf { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 8px; border: 1px solid var(--line); }
  .prow { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 12px; }
  .lname { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .lname small { color: var(--muted); font-size: 11px; }
  .prow select { flex: 0 0 auto; max-width: 55%; }
  .hint { color: var(--muted); }
  .kinds .opt { border-left: 4px solid var(--c, var(--muted)); }
  .layer { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .it { padding: 3px 8px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font-size: 11px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fields { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 12px; color: var(--muted); }
  .fields label { display: flex; align-items: center; gap: 4px; }
  .fields input[type='number'] { width: 72px; text-align: right; }
  .fields .wide { flex-basis: 100%; }
  .fields .wide input { flex: 1; }
  .unit { color: var(--muted); }
  .side { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .side small { color: var(--muted); font-size: 11px; flex: 1; }
</style>
