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
  import { commitParts, newItem, partLabel, partsForProduct, partsOf } from '../core/parts';
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

  let { obj, layout }: { obj: SignObject; layout?: Snippet } = $props();
  const ro = $derived(!app.canEdit);
  const update = (patch: Partial<SignObject>) => { if (!app.canEdit) return; app.editBoundary(); app.project.updateObject(obj.id, patch); app.editBoundary(); };
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
  const textOf = (p: SignPart) => p.items.filter((i) => i.kind === 'text' && i.text?.trim()).map((i) => i.text!.trim()).join(' ');

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
  const back = () => { focus = null; picking = false; };
</script>

<section class="props" data-testid="sign-props" data-mode={focus ? 'focus' : mode}>
  <div class="viewer" data-testid="sign-props-viewer">
    <!-- 3D 뷰어는 늘 붙어 있다 — 요소를 고르거나 배치로 바꿀 때 다시 만들지 않는다(다시 만들면 카메라가 다가가는 대신 화면이 새로 그려져 "리프레시"처럼 보였다, 2026-10-31).
         같은 사인물 3D 에서 고른 요소만 남기고 가까이 (키트 G 모델은 고르기 카드에만) -->
    <div class="slot" style:visibility={mode === 'layout' && !focus ? 'hidden' : 'visible'}>
      <SignView3D {obj} closeUp={!!focus} focusPart={focus} />
    </div>
    {#if mode === 'layout' && !focus}
      <div class="slot layout" data-testid="sign-props-layout" in:scale={{ start: 0.96, duration: 220 }} out:fade={{ duration: 160 }}>{#if layout}{@render layout()}{:else}<FrontEditor {obj} {parts} {ro} bind:sel={layoutSel} setItem={setItemById} locked={lockedIds} />{/if}</div>
    {/if}
  </div>

  {#if !focus}
    <button class="btn small" class:on={mode === 'layout'} data-testid="sign-props-layout-toggle" onclick={() => (mode = mode === 'layout' ? 'overview' : 'layout')}>{mode === 'layout' ? '배치 끝' : '배치'}</button>
    <div class="tiers" data-testid="sign-tiers">
      {#each tiers as tier, ti (ti)}
        <div class="tier" data-testid="sign-tier">
          {#each tier as p (p.id)}
            <button class="el" data-testid="sign-el" data-kind={p.kind} style:--c={componentOf(p.kind).color} onclick={() => (focus = p.id)}>
              <b>{partLabel(p)}</b>{#if textOf(p)}<small>"{textOf(p)}"</small>{/if}
            </button>
          {/each}
        </div>
      {/each}
      <div class="tier frame">
        <button class="el" data-testid="sign-el-frame" onclick={() => (focus = 'frame')}><b>{frame && frame.id !== 'body-none' ? frame.name : '프레임 없음'}</b><small>프레임</small></button>
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
</style>
