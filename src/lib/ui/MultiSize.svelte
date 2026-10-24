<!-- 다중 선택 일괄 가로·세로 (2026-10-24 사용자: "하단에는 일괄 가로 세로 사이즈 입력창 추가해주고 이미 다른 입력이 있고 서로 다르면 ? 같으면 사이즈 표시") -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { SignObject } from '../core/model';

  const objs = $derived(app.selectionIds.map((id) => app.objects.find((o) => o.id === id)).filter((o): o is SignObject => !!o));
  /** 모두 같으면 그 값, 다르면 null('?'), 모두 비었으면 undefined */
  const common = (k: 'widthMm' | 'heightMm'): number | null | undefined => {
    const vs = new Set(objs.map((o) => o[k] ?? 0));
    if (vs.size !== 1) return null;
    const v = [...vs][0];
    return v ? v : undefined;
  };
  const w = $derived(common('widthMm')), h = $derived(common('heightMm'));
  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };
  function set(k: 'widthMm' | 'heightMm', s: string) { const n = num(s); if (n) app.setSizeForSelection({ [k]: n }); }
</script>

<label class="ms"><span>가로</span><input data-testid="multi-width" type="number" inputmode="decimal" min="0" step="10" disabled={!app.canEdit}
  value={w ?? ''} placeholder={w === null ? '?' : '입력'} onchange={(e) => set('widthMm', e.currentTarget.value)} oninput={(e) => set('widthMm', e.currentTarget.value)} /></label>
<span class="x">×</span>
<label class="ms"><span>세로</span><input data-testid="multi-height" type="number" inputmode="decimal" min="0" step="10" disabled={!app.canEdit}
  value={h ?? ''} placeholder={h === null ? '?' : '입력'} onchange={(e) => set('heightMm', e.currentTarget.value)} oninput={(e) => set('heightMm', e.currentTarget.value)} /></label>
<span class="x">mm</span>

<style>
  .ms { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
  .ms input { width: 72px; padding: 4px 6px; font-size: 12px; text-align: right; }
  .ms input::placeholder { color: var(--muted); }
  .x { color: var(--muted); font-size: 11px; }
</style>
