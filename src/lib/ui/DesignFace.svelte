<!-- 사인물 면에 입힌 디자인 (소스 페이지의 잘라낸 영역) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';
  import type { DesignRef } from '../core/design';

  /** w·h = 표시 크기(px). 잘라낸 영역을 그 크기에 맞춰 늘린다 */
  let { design, w, h, testid = 'design-image' }: { design: DesignRef; w: number; h: number; testid?: string } = $props();
  const page = $derived(app.sources.find((s) => s.id === design.sourceId)?.pages[design.page]);
  let url = $state<string | undefined>(undefined);
  $effect(() => { if (page) assetUrl(page.assetId).then((u) => (url = u)); else url = undefined; });
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
