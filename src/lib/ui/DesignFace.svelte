<!-- 사인물 면에 입힌 디자인 (소스 페이지의 잘라낸 영역) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { displayUrl } from '../photoDisplay';
  import type { DesignRef } from '../core/design';

  /** w·h = 표시 크기(px). 잘라낸 영역을 그 크기에 맞춰 늘린다 */
  let { design, w, h, testid = 'design-image' }: { design: DesignRef; w: number; h: number; testid?: string } = $props();
  const page = $derived(app.sources.find((s) => s.id === design.sourceId)?.pages[design.page]);
  let url = $state<string | undefined>(undefined);
  // 줄인 사본(긴 변 ≤ 1600/2400)으로: 디자인 페이지 원본(수천 px)을 사진마다 겹치면 아이폰 메모리가 넘친다 (2026-10-18). background-size 는 CSS px 라 어떤 해상도든 같은 모양
  $effect(() => { void app.assetEpoch; if (page) displayUrl(page.assetId, { w: page.w, h: page.h }).then((u) => (url = u)); else url = undefined; });
  const sx = $derived(w / design.crop.w), sy = $derived(h / design.crop.h);
</script>

{#if page && url}
  <div
    class="face"
    data-testid={testid}
    style:width="{w}px"
    style:height="{h}px"
    style:background-image="url({url})"
    style:background-size="{page.w * sx}px {page.h * sy}px"
    style:background-position="{-design.crop.x * sx}px {-design.crop.y * sy}px"
  ></div>
{/if}

<style>
  .face { background-repeat: no-repeat; pointer-events: none; }
</style>
