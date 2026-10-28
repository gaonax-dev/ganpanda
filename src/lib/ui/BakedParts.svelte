<!--
  2D 원근 글자·그림 층을 구운 그림으로 (2026-10-29 아이폰 줌 오류): 구운 그림이 생기면 <img> 하나에 원근 변환 — 확대해도 다시 그리지 않아 메모리 그대로.
  굽기 전·다시 굽는 동안은 지금 것(DOM 층 또는 앞 그림)을 그대로 — 사라졌다 나타나지 않게
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import type { SignObject } from '../core/model';
  import { layoutParts } from '../core/partsLayout';
  import { itemAssetId } from '../render/itemImages';
  import { bakeParts } from '../render/bake2d';
  import { fnv1a } from '../core/proposal';
  import PartsOverlay from './PartsOverlay.svelte';

  let { o, mmW, mmH, w, h, transform, flat = false, onbaked }: {
    o: SignObject; mmW: number; mmH: number; w: number; h: number; transform: string;
    /** 줌아웃 LOD (2026-10-29): 굽기만 하고 그리지 않는다 — 사진이 납작한 그림 한 장으로 모아 그린다 */
    flat?: boolean; onbaked?: (url: string | null | undefined) => void;
  } = $props();
  const laid = $derived(layoutParts(o, mmW, mmH, w, h));
  let urls = $state<Record<string, string>>({});
  $effect(() => {
    void app.assetEpoch;
    for (const l of laid) {
      const id = l.image ? itemAssetId(l.image, app.sources) : undefined;
      if (id && !urls[l.id]) assetUrl(id).then((u) => { if (u) urls = { ...urls, [l.id]: u }; });
    }
  });
  const ready = $derived(laid.every((l) => l.kind !== 'image' || !!urls[l.id]));
  const key = $derived(fnv1a(JSON.stringify({ laid, w: Math.round(w), h: Math.round(h), u: laid.map((l) => urls[l.id] ?? '') })));
  let baked = $state<string | undefined>(undefined);
  /** 구운 그림에 무엇이 그려졌는지 — 읽기 도구·테스트용 (글자는 alt, 색은 data-colors) */
  const texts = $derived(laid.map((l) => l.text).filter(Boolean).join(' '));
  const colors = $derived([...new Set(laid.flatMap((l) => [l.color, l.fill]).filter(Boolean))].join(' '));
  $effect(() => {
    if (!laid.length || !ready) return;
    const k = key;
    bakeParts(k, laid, w, h, (l) => urls[l.id]).then((u) => { if (u && k === key) baked = u; });
  });
  $effect(() => onbaked?.(laid.length ? baked : null));
</script>

{#if laid.length && !flat}
  {#if baked}
    <img class="warp baked" data-testid="baked-parts" data-colors={colors} src={baked} alt={texts} draggable="false" style:width="{w}px" style:height="{h}px" style:transform={transform} />
  {:else}
    <div class="warp" style:transform={transform}><div class="pbox" style:width="{w}px" style:height="{h}px"><PartsOverlay {o} {mmW} {mmH} {w} {h} /></div></div>
  {/if}
{/if}

<style>
  .warp { position: absolute; left: 0; top: 0; transform-origin: 0 0; opacity: 0.95; }
  img.warp { display: block; max-width: none; pointer-events: none; }
  .pbox { position: relative; }
</style>
