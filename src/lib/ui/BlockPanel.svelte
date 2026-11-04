<!-- 치수 블록 속성 (2026-11-04 사용자: "블록은 속성이 사이즈와 축설정만 있다. 항상 바로 보이게 나머지는 필요없다"):
     사이즈 = 그 사인물의 치수(설정 하나 — 고치면 사인물·다른 사진의 같은 사인물도 함께), 축 = 블록이 놓인 면(벽면 Y · 옆면 X · 수평 Z).
     블록을 고르면 휴대폰·데스크톱 모두 바로 이 패널 (빠른 막대·세부 설정 없음) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { SignObject } from '../core/model';
  import type { BlockAxis } from '../core/blocks';

  let { obj, index }: { obj: SignObject; index: number } = $props();
  const ro = $derived(!app.canEdit);
  const ax = $derived(app.blockAxisOf(obj, index));
  const est = $derived(app.blockEstimate(obj, index));
  const fit = $derived(app.blockFitOf(obj, index));
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)));
  const AXES: { id: BlockAxis; label: string; title: string }[] = [
    { id: 'y', label: '벽면 Y', title: '정면 벽 위의 블록' },
    { id: 'x', label: '옆면 X', title: '벽에 직각인 세로면(옆 벽·돌출 간판 면) 위의 블록' },
    { id: 'z', label: '수평 Z', title: '수평면(바닥·천장·차양 윗면) 위의 블록' },
  ];
  function update(patch: Partial<SignObject>) {
    app.editBoundary();
    app.project.updateObject(obj.id, patch); // 규격(치수)은 원본으로 — 다른 사진의 같은 사인물도 이 값 (2026-11-04)
    app.editBoundary();
  }
</script>

<aside class="panel" data-testid="block-panel" data-index={index}>
  <header><b>치수 블록</b><span class="of">{obj.name}</span></header>
  <div class="row sizes" data-testid="block-panel-size">
    <label>가로<input data-testid="block-width" type="number" inputmode="decimal" min="0" step="10" value={obj.widthMm ?? ''} disabled={ro} oninput={(e) => update({ widthMm: num(e.currentTarget.value) })} /></label>
    <span>×</span>
    <label>세로<input data-testid="block-height" type="number" inputmode="decimal" min="0" step="10" value={obj.heightMm ?? ''} disabled={ro} oninput={(e) => update({ heightMm: num(e.currentTarget.value) })} /></label>
    <small>mm</small>
  </div>
  <div class="row axes" role="radiogroup" aria-label="축" data-testid="block-axis">
    <span class="lbl">축</span>
    {#each AXES as a (a.id)}
      <button role="radio" aria-checked={ax.axis === a.id} class:on={ax.axis === a.id} class:auto={ax.auto && ax.axis === a.id} data-testid="block-axis-{a.id}" title={a.title} disabled={ro} onclick={() => app.setBlockAxis(obj.id, index, a.id)}>{a.label}</button>
    {/each}
  </div>
  {#if est}<p class="est" class:fit data-testid="block-panel-est">지금 원근으로 ≈ {fmt(est.widthMm)} × {fmt(est.heightMm)}mm{fit ? ' · 맞음' : ''}</p>{/if}
</aside>

<style>
  .panel { position: absolute; top: 12px; right: 12px; width: 320px; z-index: 5; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45); padding-bottom: 6px; }
  header { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 15px; }
  header .of { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row { display: flex; align-items: center; gap: 6px; padding: 8px 12px 0; font-size: 12px; color: var(--muted); }
  .sizes label { display: flex; flex-direction: row; align-items: center; gap: 4px; flex: 1; margin: 0; } /* 라벨 왼쪽·칸 오른쪽 한 줄 (conventions) */
  .sizes label { white-space: nowrap; }
  .sizes input { flex: 1; width: 100%; min-width: 0; }
  .axes .lbl { margin-right: 2px; }
  .axes button { flex: 1; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 6px 4px; font: inherit; font-size: 12px; cursor: pointer; }
  .axes button.on { background: #39ff14; color: #0b1a06; border-color: #39ff14; font-weight: 700; }
  .axes button.on.auto { background: transparent; color: #39ff14; } /* 자동으로 판정한 면 — 누르면 고정 */
  .est { margin: 8px 12px 2px; font-size: 12px; color: #ef4444; }
  .est.fit { color: #a855f7; }
  @media (max-width: 720px) {
    .panel { left: 8px; right: 8px; top: auto; bottom: 8px; width: auto; padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px)); }
  }
</style>
