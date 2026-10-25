<!-- 페이지 맨 위 [← 돌아가기] (2026-10-25 사용자: "요청보기 내요청 미리보기 화면으로 이동후 돌아갈 방법이 없다" — 앱에는 브라우저 뒤로 가기가 없다)
  같은 사이트 안에서 왔으면 뒤로, 링크로 바로 열었으면(첫 화면) 홈으로 -->
<script lang="ts">
  let { label = '돌아가기', home = '/' }: { label?: string; home?: string } = $props();
  const canGoBack = () => {
    try { return history.length > 1 && !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { return false; }
  };
  function go(e: MouseEvent) {
    if (!canGoBack()) return; // 링크 그대로 홈으로
    e.preventDefault();
    history.back();
  }
</script>

<a class="back" data-testid="page-back" href={home} onclick={go}>← {label}</a>

<style>
  .back { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; margin: 0 0 6px -6px; border-radius: 8px; color: var(--muted); text-decoration: none; font-size: 13px; min-height: 36px; }
  .back:hover { color: var(--text); background: color-mix(in srgb, var(--text) 8%, transparent); }
</style>
