<!-- 실측 기준선 (사진별): 기준으로 켠 변 목록 → AI 평가(모서리 보정·모순 점검) → 전체 적용 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { Photo } from '../core/model';

  let { photo }: { photo: Photo } = $props();
  const ev = $derived(app.calibEvals[photo.id]);
  const status = $derived(app.calibStatus(photo.id));
  const LABEL = { top: '위 변', bottom: '아래 변', left: '왼쪽 변', right: '오른쪽 변' } as const;
  const nameOf = (id: string) => app.objects.find((o) => o.id === id)?.name ?? id;
  const STATUS_TEXT = { none: '기준 없음', unevaluated: '평가 전', evaluated: '평가됨 — 적용하세요', applied: '적용됨', stale: '기준이 바뀌었습니다 — 다시 평가' } as const;
</script>

<div class="calib" data-testid="calib-panel">
  <header>
    <b>실측 기준선</b>
    <span class="status" data-testid="calib-status" data-status={status}>{STATUS_TEXT[status]}</span>
  </header>
  <p class="hint">실측한 사인물 패널에서 "가로 기준"·"세로 기준"을 켜면 그 변이 기준선이 됩니다. 가로선은 가로 축척, 세로선은 세로 축척을 정합니다.</p>
  {#if ev}
    <ul>
      {#each ev.refs as r (r.objectId + r.edge)}
        <li data-testid="calib-ref" class:bad={Math.abs(r.deviation) > 0.1 || r.confidence < 0.2}>
          <span>{nameOf(r.objectId)} · {LABEL[r.edge]} ({r.kind === 'h' ? '가로' : '세로'})</span>
          <small>{r.manual ? '직접 조정' : r.confidence >= 0.2 ? `모서리 보정 ${r.offset > 0 ? '+' : ''}${r.offset}px` : '모서리 못 찾음'} · 편차 {(r.deviation * 100).toFixed(1)}%</small>
        </li>
      {/each}
    </ul>
    {#each ev.warnings as w, i (i)}<p class="warn">⚠ {w}</p>{/each}
  {/if}
  {#if app.canEdit}
    <div class="actions">
      <button class="btn small" data-testid="calib-eval" disabled={status === 'none' || app.calibBusy} onclick={() => app.evaluateCalibration(photo.id)}>{app.calibBusy ? '평가 중…' : 'AI 평가'}</button>
      <button class="btn small" data-testid="calib-edit" disabled={status === 'none'} title="AI 가 잡은 선을 창에서 직접 끌어 고칩니다" onclick={() => { app.ensureCalibEval(photo.id); app.calibEditPhotoId = photo.id; }}>선 직접 조정</button>
      <button class="btn small primary" data-testid="calib-apply" disabled={status !== 'evaluated'} onclick={() => app.applyCalibration(photo.id)}>전체 적용</button>
    </div>
  {/if}
</div>

<style>
  .calib { position: absolute; left: 12px; top: 12px; width: 300px; z-index: 4; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
  header { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  .status { font-size: 11px; color: var(--muted); }
  .status[data-status='applied'] { color: var(--ok); }
  .status[data-status='stale'], .status[data-status='evaluated'] { color: var(--warn); }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 3px; }
  li { display: flex; flex-direction: column; font-size: 12px; padding: 4px 6px; border-radius: 6px; background: var(--input); }
  li.bad { outline: 1px solid var(--warn); }
  li small { color: var(--muted); font-size: 11px; }
  .warn { color: var(--warn); font-size: 12px; margin: 0; }
  .actions { display: flex; gap: 6px; }
</style>
