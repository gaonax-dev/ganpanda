<!--
  평면도 카드(보드·리스트) 위에 조합형 객체를 정면도 배치대로 (2026-10-16 4단계). w·h = 카드 크기(px), mmW·mmH = 그 카드가 나타내는 사인물 mm.
  사진 얼굴이 지금 달린 간판이어도 새로 정한 글자·그림 배치가 보이도록 위에 겹친다
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import type { SignObject } from '../core/model';
  import { layoutParts, partsSvg } from '../core/partsLayout';
  import { itemAssetId } from '../render/itemImages';

  let { o, mmW, mmH, w, h }: { o: SignObject; mmW: number; mmH: number; w: number; h: number } = $props();
  const laid = $derived(layoutParts(o, mmW, mmH, w, h));
  let urls = $state<Record<string, string>>({});
  $effect(() => {
    for (const l of laid) {
      const id = l.image ? itemAssetId(l.image, app.sources) : undefined;
      if (id && !urls[l.id]) assetUrl(id).then((u) => { if (u) urls = { ...urls, [l.id]: u }; });
    }
  });
</script>

{#if laid.length}
  <svg class="parts" data-testid="parts-overlay" width={w} height={h} viewBox="0 0 {w} {h}">{@html partsSvg(laid, (l) => urls[l.id])}</svg>
{/if}

<style>
  .parts { position: absolute; inset: 0; overflow: visible; pointer-events: none; font-family: Pretendard, sans-serif; }
</style>
