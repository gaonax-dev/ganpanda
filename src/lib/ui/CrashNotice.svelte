<!--
  진단 기록 (2026-10-29 사용자: "줌인아웃을 반복하면 다운된다"): 앱이 정상 종료 없이 곧 다시 열리면(아이폰 메모리 초과 등) 직전 상태를 보여 준다.
  [복사]로 기록 전체를 붙여 넣을 수 있게, [닫기]면 다시 안 나온다
-->
<script lang="ts">
  import { crashLog } from '../crashLog';

  let rec = $state(crashLog.previous());
  let copied = $state(false);
  const board = $derived((rec?.state.board ?? {}) as Record<string, unknown>);
  const time = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour12: false });
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify(rec, null, 1)); copied = true; } catch { copied = false; }
  }
  function close() { crashLog.dismiss(); rec = null; }
</script>

{#if rec}
  <div class="crash" data-testid="crash-notice" role="alert">
    <b>직전에 앱이 비정상 종료되었습니다</b> <span class="t">{time(rec.t)}</span>
    <div class="row">
      {board.stage ?? '?'} · 배율 {typeof board.zoom === 'number' ? Math.round(board.zoom * 1000) / 10 + '%' : '?'} · 실시간 3D {board.live ?? '없음'} · 지은 장면 {board.built ?? '없음'} · 그림판 {rec.state.canvases || '없음'} · 그림 {rec.state.imgs ?? '?'}
    </div>
    <ol class="ev">
      {#each rec.events.slice(-10) as e (e.t + e.msg)}<li><span class="t">{time(e.t)}</span> {e.msg}</li>{/each}
    </ol>
    <div class="btns">
      <button data-testid="crash-copy" onclick={copy}>{copied ? '복사됨' : '기록 복사'}</button>
      <button data-testid="crash-close" onclick={close}>닫기</button>
    </div>
  </div>
{/if}

<style>
  .crash {
    position: fixed; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 56px); z-index: 1000;
    width: min(520px, calc(100vw - 32px)); box-sizing: border-box; padding: 12px 14px; border-radius: 10px;
    background: var(--panel); color: var(--text); border: 1px solid var(--warn); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45); font-size: 12.5px; line-height: 1.5;
  }
  .row { margin-top: 6px; color: var(--text); overflow-wrap: anywhere; }
  .t { color: var(--muted); font-variant-numeric: tabular-nums; }
  .ev { margin: 6px 0 0; padding-left: 18px; max-height: 160px; overflow: auto; color: var(--muted); }
  .btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  .btns button { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line); background: var(--hover); color: var(--text); font: inherit; cursor: pointer; }
</style>
