<!-- 화면 로딩 표시: 반투명 덮개 + 회전 고리 + 문구 (2026-10-15 사용자: "화면 로딩 표시해줘, 모바일에서는 무겁다") -->
<script lang="ts">
  let { text = '불러오는 중…', inline = false }: { text?: string; inline?: boolean } = $props();
</script>

<div class="loading" class:inline data-testid="loading" role="status" aria-live="polite">
  <span class="ring" aria-hidden="true"></span>
  <span>{text}</span>
</div>

<style>
  .loading { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: rgba(15, 17, 21, 0.72); color: var(--text); font-size: 14px; pointer-events: none; }
  .loading.inline { position: absolute; background: rgba(15, 17, 21, 0.5); }
  .ring { width: 34px; height: 34px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.15); border-top-color: var(--accent); animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
