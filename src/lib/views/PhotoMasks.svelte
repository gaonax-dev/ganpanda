<!--
  앞가림 마스크 층 (2026-11-08 "마스크를 추가한다" → (질문) "앞가림 마스크"): 제안·디자인(2D·3D) 화면에서 마스크 모양대로 원래 사진을 사인물 위에 다시 덮는다
  — 간판 앞의 나무·전봇대·차양이 사인물 앞에 그대로 보인다. 보드 층에서 사진 칸들과 실시간 3D 화면(live3d) 위에 놓여 2D 겹침·3D 그림·실시간 3D 를 모두 덮는다.
  누르기는 통과(pointer-events none). 편집은 실측 탭(PhotoZone + PathEdit) → docs/features/photo-board.md
-->
<script lang="ts">
  import { assetUrl } from '../assets';
  import { pathD } from '../core/pathEdit';
  import type { Photo } from '../core/model';

  let { photos }: { photos: Photo[] } = $props();
  let urls = $state<Record<string, string>>({});
  $effect(() => { for (const p of photos) if (p.masks?.length && !urls[p.assetId]) assetUrl(p.assetId).then((u) => u && (urls = { ...urls, [p.assetId]: u })); });
</script>

{#each photos.filter((p) => p.masks?.length) as p (p.id)}
  <svg class="masks" data-testid="photo-masks" data-photo={p.id} data-count={p.masks!.length} viewBox="0 0 {p.w} {p.h}" preserveAspectRatio="none"
    style:left="{p.x}px" style:top="{p.y}px" style:width="{p.width}px" style:height="{p.width * (p.h / p.w)}px" aria-hidden="true">
    <defs><clipPath id="mask-{p.id}">{#each p.masks! as m, i (i)}<path d={pathD(m)} />{/each}</clipPath></defs>
    {#if urls[p.assetId]}<image data-testid="photo-mask-image" href={urls[p.assetId]} x="0" y="0" width={p.w} height={p.h} preserveAspectRatio="none" clip-path="url(#mask-{p.id})" />{/if}
  </svg>
{/each}

<style>
  /* z 2 = 실시간 3D(.live3d z 1)·3D 그림 위 (2026-11-08 "마스크 … 나타나지 않는데" — z 없이 두어 실시간 3D 아래에 깔렸다), 커서(z 3) 아래 */
  .masks { position: absolute; pointer-events: none; overflow: visible; z-index: 2; }
</style>
