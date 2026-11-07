<!-- 입힌 디자인 원근 층을 구운 그림으로 (2026-10-29 아이폰 줌 오류) — BakedParts 와 같은 방식 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { displayUrl } from '../photoDisplay';
  import type { DesignRef } from '../core/design';
  import { bakeDesign, bakeErrors } from '../render/bake2d';
  import DesignFace from './DesignFace.svelte';
  import { crashLog } from '../crashLog';

  let { design, w, h, transform, flat = false, onbaked }: {
    design: DesignRef; w: number; h: number; transform: string;
    /** 줌아웃 LOD (2026-10-29) — BakedParts 와 같음 */
    flat?: boolean; onbaked?: (url: string | null | undefined) => void;
  } = $props();
  const page = $derived(app.sources.find((s) => s.id === design.sourceId)?.pages[design.page]);
  let pageUrl = $state<string | undefined>(undefined);
  $effect(() => { void app.assetEpoch; if (page) displayUrl(page.assetId, { w: page.w, h: page.h }).then((u) => (pageUrl = u)); });
  const key = $derived(page ? `${page.assetId}|${JSON.stringify(design.crop)}|${Math.round(w)}x${Math.round(h)}` : '');
  /** 구운 그림 (null = 굽지 못함 — 합성에서 빼고 이 층을 굽지 않은 채 그린다, 2026-11-07) */
  let baked = $state<string | null | undefined>(undefined);
  $effect(() => {
    if (!page || !pageUrl) return;
    const k = key;
    bakeDesign(k, pageUrl, design.crop, page.w, page.h, w, h).then((u) => { if (k !== key) return; baked = u ?? null; if (!u) crashLog.event(`디자인 굽기 실패 ${page.assetId.slice(0, 8)} ${page.w}×${page.h} → ${Math.round(w)}×${Math.round(h)} · ${(pageUrl ?? '').slice(0, 5)} · ${bakeErrors.get(`d|${k}`) ?? '이유 없음'}`); });
  });
  // 디자인 페이지를 못 찾으면(소스·그림 없음) 기다리지 않는다
  $effect(() => { if (!page) baked = null; });
  $effect(() => onbaked?.(baked));
</script>

{#if !flat && baked}
  <img class="warp baked" data-testid="baked-design" data-source={design.sourceId} src={baked} alt="" draggable="false" style:width="{w}px" style:height="{h}px" style:transform={transform} />
{:else if !flat || baked === null}
  <!-- 굽지 못했으면 줌아웃 합성에서도 이 층은 직접 그린다 -->
  <div class="warp" style:transform={transform}><DesignFace {design} {w} {h} /></div>
{/if}

<style>
  .warp { position: absolute; left: 0; top: 0; transform-origin: 0 0; opacity: 0.95; }
  img.warp { display: block; max-width: none; pointer-events: none; }
</style>
