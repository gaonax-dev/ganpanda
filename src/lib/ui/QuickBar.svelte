<!--
  휴대폰 폭 빠른 막대 (2026-10-14 사용자: "모바일에서 사인물을 생성하면 속성으로 화면이 가려진다… 속성은 따로 열어 편집… 현장에서는 모바일로 간단하게 치수만 입력")
  · 선택한 사인물의 이름 · 가로×세로 실측(mm) 입력 · 같은 사진의 이전/다음 사인물 · [속성] 으로 전체 패널 열기
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { SignObject } from '../core/model';

  let { obj }: { obj: SignObject } = $props();

  const ro = $derived(!app.canEdit);
  const m = $derived(app.measures.get(obj.id));
  /** 같은 사진의 사인물 (순서대로 돌며 치수 입력) */
  const siblings = $derived(app.photoSigns(obj.photoId));
  const idx = $derived(siblings.findIndex((o) => o.id === obj.id));
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)));
  const update = (patch: Partial<SignObject>) => { if (app.canEdit) app.project.updateObject(obj.id, patch); };
  function step(d: number) {
    if (!siblings.length) return;
    app.selectObject(siblings[(idx + d + siblings.length) % siblings.length].id);
  }
</script>

<div class="quick" data-testid="quick-bar">
  <button class="icon" data-testid="quick-prev" title="이전 사인물" disabled={siblings.length < 2} onclick={() => step(-1)}>‹</button>
  <span class="name" data-testid="quick-name" title={obj.name}>{obj.name}{#if siblings.length > 1}<small> {idx + 1}/{siblings.length}</small>{/if}</span>
  <button class="icon" data-testid="quick-next" title="다음 사인물" disabled={siblings.length < 2} onclick={() => step(1)}>›</button>
  <label class="dim">
    <input data-testid="quick-width" type="number" inputmode="decimal" min="0" step="10" value={obj.widthMm ?? ''} disabled={ro}
      placeholder={m?.estimate ? `≈${fmt(m.estimate.widthMm)}` : '가로'} oninput={(e) => update({ widthMm: num(e.currentTarget.value) })} />
    <span>×</span>
    <input data-testid="quick-height" type="number" inputmode="decimal" min="0" step="10" value={obj.heightMm ?? ''} disabled={ro}
      placeholder={m?.estimate ? `≈${fmt(m.estimate.heightMm)}` : '세로'} oninput={(e) => update({ heightMm: num(e.currentTarget.value) })} />
    <span>mm</span>
  </label>
  <button class="btn small" data-testid="quick-panel-open" onclick={() => (app.panelOpen = true)}>속성</button>
  <button class="icon" title="선택 해제" onclick={() => app.selectObject(null)}>✕</button>
</div>

<style>
  .quick {
    position: absolute; left: 8px; right: 8px; bottom: 66px; z-index: 5;
    display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-radius: 12px;
    background: var(--panel); border: 1px solid var(--line); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }
  .name { flex: 1; min-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
  .name small { color: var(--muted); font-weight: 400; }
  .dim { flex-direction: row; align-items: center; gap: 3px; font-size: 11px; color: var(--muted); }
  .dim input { width: 64px; padding: 6px 6px; font-size: 13px; text-align: right; }
  .icon { padding: 4px 6px; font-size: 18px; line-height: 1; }
</style>
