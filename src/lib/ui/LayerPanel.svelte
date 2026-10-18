<!--
  레이어 패널 (레이어 구조 3단계, 2026-10-18 — docs/architecture/composition-layers.md): 설정 창 [배치] 탭에서 정면도 옆.
  트리(프레임 → 구성 요소 → 글자·그림·도형·그룹), 위가 맨 위 레이어(일러스트레이터 손버릇). 누르면 정면도 선택과 같이 움직이고,
  눈(보이기)·자물쇠(잠금)·▲▼(순서)·체크 → [그룹]·[풀기]·이름(더블클릭)·✕. 편집은 트리에 바로 쓰고 거울(parts)을 다시 만든다(commitLayers).
-->
<script lang="ts">
  import type { Layer, SignObject, SignPart } from '../core/model';
  import { groupLayers, isGroup, isItemLayer, isPartLayer, layersOf, moveLayer, nearestPartId, removeLayer, setLayerProps, ungroupLayer } from '../core/layers';
  import { commitLayers, partsOf } from '../core/parts';
  import { componentOf } from '../core/components';
  import { productById } from '../core/catalog';
  import { setFrom } from '../core/setLibrary';
  import { app } from '../state.svelte';

  type Sel = { part: string; item: string } | null;
  let { obj, ro, update, sel = $bindable() }: { obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void; sel: Sel } = $props();

  const layers = $derived(layersOf(obj, partsOf(obj)));
  let checked = $state<string[]>([]);
  let collapsed = $state<Record<string, boolean>>({});
  let renaming = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  $effect(() => { if (sel?.item) selectedId = sel.item; });

  const commit = (ls: Layer[]) => update(commitLayers(obj, ls));
  const SHAPE_LABEL: Record<string, string> = { rect: '사각', ellipse: '원', line: '선' };
  function label(l: Layer): string {
    if (l.name) return l.name;
    if (isGroup(l)) return '그룹';
    if (isPartLayer(l)) {
      const c = componentOf(l.kind);
      const { type, ...options } = l.spec as { type?: string } & Record<string, string | boolean>;
      const p: SignPart = { id: l.id, kind: l.kind as SignPart['kind'], type: String(type ?? ''), options, items: [] };
      return `${c.label} · ${c.typeLabel(p)}`;
    }
    if (l.kind === 'text') return String(l.spec.text ?? '').trim() || '글자';
    if (l.kind === 'image') return '그림';
    if (l.kind === 'shape') return `도형 · ${SHAPE_LABEL[String(l.spec.shape ?? 'rect')] ?? ''}`;
    return l.kind;
  }
  function pick(l: Layer) {
    selectedId = l.id;
    if (isItemLayer(l)) { const part = nearestPartId(layers, l.id); if (part) sel = { part, item: l.id }; } else sel = null;
  }
  const toggleCheck = (id: string) => { checked = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]; };
  function group() {
    if (checked.length < 2) return;
    const next = groupLayers(layers, checked);
    if (next !== layers) { commit(next); checked = []; }
  }
  const rename = (l: Layer, v: string) => { commit(setLayerProps(layers, l.id, { name: v.trim() || undefined })); renaming = null; };
  const stop = (e: Event) => e.stopPropagation();
  /** 세트로 저장 (4단계): 체크한 레이어(없으면 전체)를 이름 붙여 계정 라이브러리에 */
  function saveSet() {
    const name = prompt('세트 이름', '');
    if (name === null) return;
    const set = setFrom(layers, checked, obj, name);
    if (!set) return;
    void app.addSet(set);
    checked = [];
  }
</script>

<div class="layers" data-testid="layer-panel">
  <div class="head">
    <b>레이어</b>
    <span class="hint">위가 맨 위. 눈 = 보이기, 자물쇠 = 잠금, 체크 뒤 그룹</span>
    <button class="btn small" data-testid="layer-group" disabled={ro || checked.length < 2} title="체크한 레이어를 그룹으로 (같은 부모 안에서)" onclick={group}>그룹</button>
    <button class="btn small" data-testid="layer-save-set" disabled={ro || !layers.length} title="체크한 레이어(없으면 전체)를 세트로 저장 — 다른 사인물에 비율 맞춰 넣을 수 있습니다" onclick={saveSet}>세트로 저장</button>
  </div>
  <div class="tree">
    {@render rows(layers, 0)}
    <div class="row frame" data-testid="layer-frame"><span class="tw"></span><span class="name">프레임 · {productById(obj.productId)?.name ?? '종류 미지정'}</span></div>
  </div>
</div>

{#snippet rows(ls: Layer[], depth: number)}
  {#each [...ls].reverse() as l (l.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="row" data-testid="layer-row" data-id={l.id} data-kind={l.kind} data-selected={selectedId === l.id} data-hidden={l.visible === false} style:padding-left="{6 + depth * 14}px" onclick={() => pick(l)}>
      {#if l.children.length}
        <button class="tw" title={collapsed[l.id] ? '펼치기' : '접기'} onclick={(e) => { stop(e); collapsed[l.id] = !collapsed[l.id]; }}>{collapsed[l.id] ? '▸' : '▾'}</button>
      {:else}<span class="tw"></span>{/if}
      <input type="checkbox" data-testid="layer-check" checked={checked.includes(l.id)} disabled={ro} onclick={stop} onchange={() => toggleCheck(l.id)} />
      <button class="icon eye" class:off={l.visible === false} data-testid="layer-eye" title={l.visible === false ? '보이기' : '숨기기 (견적·3D·카드에서도 빠짐)'} disabled={ro} onclick={(e) => { stop(e); commit(setLayerProps(layers, l.id, { visible: l.visible === false })); }}>{l.visible === false ? '○' : '●'}</button>
      <button class="icon lock" class:on={!!l.locked} data-testid="layer-lock" title={l.locked ? '잠금 풀기' : '잠금 (정면도에서 끌 수 없음)'} disabled={ro} onclick={(e) => { stop(e); commit(setLayerProps(layers, l.id, { locked: !l.locked })); }}>{l.locked ? '🔒' : '🔓'}</button>
      {#if renaming === l.id}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="rename" data-testid="layer-name-input" value={l.name ?? ''} placeholder={label(l)} autofocus onclick={stop}
          onkeydown={(e) => { if (e.key === 'Enter') rename(l, e.currentTarget.value); if (e.key === 'Escape') renaming = null; }} onblur={(e) => rename(l, e.currentTarget.value)} />
      {:else}
        <span class="name" data-testid="layer-name" title="더블클릭으로 이름" ondblclick={(e) => { stop(e); if (!ro) renaming = l.id; }}>{label(l)}</span>
      {/if}
      <span class="acts">
        <button class="icon" data-testid="layer-up" title="위로" disabled={ro} onclick={(e) => { stop(e); commit(moveLayer(layers, l.id, 1)); }}>▲</button>
        <button class="icon" data-testid="layer-down" title="아래로" disabled={ro} onclick={(e) => { stop(e); commit(moveLayer(layers, l.id, -1)); }}>▼</button>
        {#if isGroup(l)}<button class="btn small" data-testid="layer-ungroup" disabled={ro} onclick={(e) => { stop(e); commit(ungroupLayer(layers, l.id)); }}>풀기</button>{/if}
        {#if !isPartLayer(l)}<button class="icon del" data-testid="layer-remove" title="지우기" disabled={ro} onclick={(e) => { stop(e); commit(removeLayer(layers, l.id)); }}>✕</button>{/if}
      </span>
    </div>
    {#if l.children.length && !collapsed[l.id]}{@render rows(l.children, depth + 1)}{/if}
  {/each}
{/snippet}

<style>
  .layers { border: 1px solid var(--line); border-radius: 10px; font-size: 12px; min-width: 0; }
  .head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  .head .hint { flex: 1; color: var(--muted); font-size: 11px; }
  .tree { max-height: 240px; overflow: auto; padding: 4px 0; }
  .row { display: flex; align-items: center; gap: 4px; padding: 2px 8px 2px 6px; cursor: pointer; border-radius: 6px; min-height: 26px; }
  .row:hover { background: var(--hover); }
  .row[data-selected='true'] { background: rgba(90, 168, 255, 0.16); }
  .row[data-hidden='true'] .name { opacity: 0.45; text-decoration: line-through; }
  .row.frame { color: var(--muted); cursor: default; }
  .tw { width: 14px; display: inline-grid; place-items: center; background: none; border: 0; color: var(--muted); font-size: 10px; padding: 0; cursor: pointer; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rename { flex: 1; min-width: 60px; font-size: 12px; padding: 1px 4px; }
  .acts { display: inline-flex; gap: 2px; opacity: 0.35; }
  .row:hover .acts, .row[data-selected='true'] .acts { opacity: 1; }
  .icon { width: 22px; height: 22px; font-size: 11px; }
  .eye.off { color: var(--muted); }
  .lock.on { color: var(--warn); }
  input[type='checkbox'] { width: auto; margin: 0; }
</style>
