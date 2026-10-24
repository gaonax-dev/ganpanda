<!-- 다중 선택: [마지막 사인물 ▾] → 구성 적용 · 사이즈 적용 (2026-10-24 사용자: "다중선택시 마지막 사인물(버튼누르면 메뉴:구성 적용, 사이즈 적용) 정리버튼 대신") -->
<script lang="ts">
  import { app } from '../state.svelte';
  let open = $state(false);
  const last = $derived(app.selected);
</script>

<svelte:window onpointerdown={() => (open = false)} />
<span class="ml" role="presentation" onpointerdown={(e) => e.stopPropagation()}>
  <button class="btn small" data-testid="multi-last" title="마지막에 고른 사인물 — 그 구성·사이즈를 나머지에" onclick={() => (open = !open)}>마지막: {last?.name ?? '-'} ▾</button>
  {#if open}
    <div class="menu" role="menu" data-testid="multi-last-menu">
      <button class="item" data-testid="multi-apply" title="종류·옵션·시트·두께·구성 요소 재료를 나머지에 (가로·세로·이름·문구·글자 배치는 그대로)" onclick={() => { open = false; app.applySelectedSpecToOthers(); }}>구성 적용</button>
      <button class="item" data-testid="multi-size" title="가로·세로·두께(mm)를 나머지에 (사진 위 영역은 그대로)" onclick={() => { open = false; app.applySelectedSizeToOthers(); }}>사이즈 적용</button>
    </div>
  {/if}
</span>

<style>
  .ml { position: relative; display: inline-flex; }
  .menu { position: absolute; bottom: calc(100% + 4px); right: 0; z-index: 30; min-width: 140px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 4px; display: flex; flex-direction: column; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4); }
  .item { background: none; border: 0; color: var(--text); text-align: left; padding: 8px 10px; border-radius: 6px; font: inherit; font-size: 13px; cursor: pointer; }
  .item:hover { background: var(--input); }
</style>
