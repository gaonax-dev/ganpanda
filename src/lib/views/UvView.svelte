<!-- UV 뷰: 디자인 파일 속 이미지를 골라 사인물 면에 매핑 (다음 단계에서 구현) -->
<script lang="ts">
  import InfiniteCanvas from '../ui/InfiniteCanvas.svelte';
  import type { Viewport } from '../core/viewport';

  let viewport: Viewport = $state({ x: 0, y: 0, zoom: 1 });
</script>

<InfiniteCanvas bind:viewport testid="uv-canvas">
  {#snippet overlay()}
    <div class="soon">
      <h2>UV 뷰 · 준비 중</h2>
      <p>디자인 파일(PNG·SVG·PDF)을 올리고, 파일 속 여러 이미지 중 하나를 골라 사인물 면에 맞춰 넣는 화면입니다.</p>
    </div>
  {/snippet}
  <div></div>
</InfiniteCanvas>

<style>
  .soon { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; color: var(--muted); max-width: 440px; margin: auto; }
  h2 { color: var(--text); font-size: 18px; }
</style>
