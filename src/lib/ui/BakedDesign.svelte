<!-- 입힌 디자인 원근 층을 구운 그림으로 (2026-10-29 아이폰 줌 오류) — BakedParts 와 같은 방식 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { displayUrl } from '../photoDisplay';
  import type { DesignRef } from '../core/design';
  import { bakeDesign } from '../render/bake2d';
  import DesignFace from './DesignFace.svelte';

  let { design, w, h, transform, flat = false, onbaked }: {
    design: DesignRef; w: number; h: number; transform: string;
    /** 줌아웃 LOD (2026-10-29) — BakedParts 와 같음 */
    flat?: boolean; onbaked?: (url: string | undefined) => void;
  } = $props();
  const page = $derived(app.sources.find((s) => s.id === design.sourceId)?.pages[design.page]);
  let pageUrl = $state<string | undefined>(undefined);
  $effect(() => { void app.assetEpoch; if (page) displayUrl(page.assetId, { w: page.w, h: page.h }).then((u) => (pageUrl = u)); });
  const key = $derived(page ? `${page.assetId}|${JSON.stringify(design.crop)}|${Math.round(w)}x${Math.round(h)}` : '');
  let baked = $state<string | undefined>(undefined);
  $effect(() => {
    if (!page || !pageUrl) return;
    const k = key;
    bakeDesign(k, pageUrl, design.crop, page.w, page.h, w, h).then((u) => { if (u && k === key) baked = u; });
  });
  $effect(() => onbaked?.(baked));
</script>

{#if !flat && baked}
  <img class="warp baked" data-testid="baked-design" src={baked} alt="" draggable="false" style:width="{w}px" style:height="{h}px" style:transform={transform} />
{:else if !flat}
  <div class="warp" style:transform={transform}><DesignFace {design} {w} {h} /></div>
{/if}

<style>
  .warp { position: absolute; left: 0; top: 0; transform-origin: 0 0; opacity: 0.95; }
  img.warp { display: block; max-width: none; pointer-events: none; }
</style>
