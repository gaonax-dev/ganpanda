<!-- 치수 블록 속성 (2026-11-04 사용자: "블록은 속성이 사이즈와 축설정만 있다. 항상 바로 보이게 나머지는 필요없다" →
     "블록 치수는 사용자가 입력한 값을 사용하고 추정치는 여기에 없다. 블록은 입력한 값만 나오고 여러 값과 방향을 지원한다"):
     사이즈 = 이 블록의 입력 치수(블록마다 다름), 축 = 블록이 놓인 면(벽면 Y · 옆면 X · 수평 Z). 추정치는 보이지 않는다.
     블록을 고르면 휴대폰·데스크톱 모두 바로 이 패널 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { BlockAxis } from '../core/blocks';

  let { photoId, index }: { photoId: string; index: number } = $props();
  const ro = $derived(!app.canEdit);
  const block = $derived(app.blockAt(photoId, index));
  const ax = $derived(app.blockAxisOf(photoId, index));
  const bad = $derived(app.blockMismatchOf(photoId, index));
  const outlier = $derived(!bad && app.blockOutlierOf(photoId, index));
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)) || undefined);
  /** 칸을 떠날 때(엔터·바깥 누르기) 한 번 반영 — 글자마다 저장하면 블록을 매번 다시 써서 입력이 끊겼다 (2026-11-04 "입력 후 엔터나 화면밖 클릭에 포커스해제와 입력이 안된다") */
  function commit(k: 'w' | 'h', v: string) {
    const n = num(v);
    if (n === block?.[k]) return;
    app.setBlockSize(photoId, index, { [k]: n });
  }
  /** 엔터 = 입력 끝 (포커스 해제 → change 로 반영) */
  const enterBlur = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); };
  const AXES: { id: BlockAxis; label: string; title: string }[] = [
    { id: 'y', label: '벽면 Y', title: '정면 벽 위의 블록' },
    { id: 'x', label: '옆면 X', title: '벽에 직각인 세로면(옆 벽·돌출 간판 면) 위의 블록' },
    { id: 'z', label: '수평 Z', title: '수평면(바닥·천장·차양 윗면) 위의 블록' },
  ];
</script>

<aside class="panel" data-testid="block-panel" data-index={index}>
  <header><b>치수 블록</b><span class="of">{index + 1}</span></header>
  <div class="row sizes" data-testid="block-panel-size">
    <label>가로<input data-testid="block-width" class:need={!block?.w && !block?.h} type="number" inputmode="decimal" min="0" step="10" placeholder="입력" value={block?.w ?? ''} disabled={ro} onchange={(e) => commit('w', e.currentTarget.value)} onkeydown={enterBlur} /></label>
    <span>×</span>
    <label>세로<input data-testid="block-height" class:need={!block?.w && !block?.h} type="number" inputmode="decimal" min="0" step="10" placeholder="입력" value={block?.h ?? ''} disabled={ro} onchange={(e) => commit('h', e.currentTarget.value)} onkeydown={enterBlur} /></label>
    <small>mm</small>
  </div>
  {#if outlier}<p class="bad" data-testid="block-outlier">⚠ 다른 블록과 안 맞음 — 이 블록이 말하는 축척이 다른 블록들과 25% 넘게 달라 치수 기준에서 뺐습니다. 튀어나온 기둥처럼 깊이가 다른 면에 그렸거나 치수가 그린 크기와 다른지 확인하세요.</p>{/if}
  {#if bad}<p class="bad" data-testid="block-mismatch">⚠ 원근과 안 맞음 — 넣은 가로·세로 비율이 원근으로 잰 비율과 30% 넘게 달라 치수 기준에서 뺐습니다. 치수(가로·세로 바뀜?)·축·원근을 확인하세요.</p>{/if}
  <div class="row axes" role="radiogroup" aria-label="축" data-testid="block-axis">
    <span class="lbl">축</span>
    {#each AXES as a (a.id)}
      <button role="radio" aria-checked={ax.axis === a.id} class:on={ax.axis === a.id} class:auto={ax.auto && ax.axis === a.id} data-testid="block-axis-{a.id}" title={a.title} disabled={ro} onclick={() => app.setBlockAxis(photoId, index, a.id)}>{a.label}</button>
    {/each}
  </div>
</aside>

<style>
  .panel { position: absolute; top: 12px; right: 12px; width: 320px; z-index: 5; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45); padding-bottom: 10px; }
  header { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); font-size: 15px; }
  header .of { color: var(--muted); font-size: 12px; }
  .row { display: flex; align-items: center; gap: 6px; padding: 8px 12px 0; font-size: 12px; color: var(--muted); }
  .sizes label { display: flex; flex-direction: row; align-items: center; gap: 4px; flex: 1; margin: 0; white-space: nowrap; } /* 라벨 왼쪽·칸 오른쪽 한 줄 (conventions) */
  .sizes input { flex: 1; width: 100%; min-width: 0; }
  .sizes input.need { outline: 2px solid #39ff14; outline-offset: 1px; } /* 치수 입력 전 */
  .bad { margin: 8px 12px 0; font-size: 12px; line-height: 1.4; color: #fb923c; }
  .axes .lbl { margin-right: 2px; }
  .axes button { flex: 1; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 6px 4px; font: inherit; font-size: 12px; cursor: pointer; }
  .axes button.on { background: #39ff14; color: #0b1a06; border-color: #39ff14; font-weight: 700; }
  .axes button.on.auto { background: transparent; color: #39ff14; } /* 정하지 않음 = 벽면 — 누르면 고정 */
  @media (max-width: 720px) {
    .panel { left: 8px; right: 8px; top: auto; bottom: 8px; width: auto; padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
  }
</style>
