<!-- 말풍선 안 첨부: 이미지는 썸네일, 음성은 재생기(2026-10-18 녹음), 그 외는 파일 링크 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { Attachment } from '../core/model';
  import { isAudio, isImage } from '../core/attachments';
  import { formatBytes } from '../core/format';
  import { assetUrl } from '../assets';

  let { att }: { att: Attachment } = $props();
  let url = $state<string | undefined>(undefined);
  $effect(() => { void app.assetEpoch; assetUrl(att.assetId).then((u) => (url = u)); });

  function open() { if (url) window.open(url, '_blank', 'noopener'); }
</script>

{#if isImage(att)}
  {#if url}
    <button class="img" onclick={open} title={att.name}><img data-testid="chat-image" src={url} alt={att.name} /></button>
  {:else}
    <div class="loading">사진 불러오는 중…</div>
  {/if}
{:else if isAudio(att)}
  {#if url}
    <!-- svelte-ignore a11y_media_has_caption -->
    <audio class="audio" data-testid="chat-audio" controls preload="metadata" src={url} title={att.name}></audio>
  {:else}
    <div class="loading">음성 불러오는 중…</div>
  {/if}
{:else}
  <button class="file" data-testid="chat-file" onclick={open} disabled={!url}>📄 <span>{att.name}</span><small>{formatBytes(att.size)}</small></button>
{/if}

<style>
  .img { display: block; background: none; border: 0; padding: 0; cursor: zoom-in; max-width: 220px; }
  .img img { display: block; max-width: 220px; max-height: 180px; border-radius: 8px; }
  .loading { font-size: 12px; color: #666; }
  .audio { display: block; max-width: 240px; height: 36px; }
  .file { display: inline-flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12px; cursor: pointer; color: inherit; max-width: 220px; }
  .file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file small { color: #666; }
</style>
