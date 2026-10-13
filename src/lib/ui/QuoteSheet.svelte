<!-- 견적서 (인쇄·PDF): 브라우저 인쇄로 저장 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { won } from '../core/quote';

  const q = $derived(app.quote);
  const today = new Date().toLocaleDateString('ko-KR');
  const projectName = $derived(app.access.status === 'ok' ? app.access.projectName : '');
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
</script>

<div class="sheet-wrap" data-testid="quote-sheet">
  <div class="toolbar no-print">
    <button class="btn primary" onclick={() => window.print()}>인쇄 · PDF 저장</button>
    <button class="btn" data-testid="close-quote-sheet" onclick={() => (app.quoteSheetOpen = false)}>닫기</button>
  </div>
  <article class="paper">
    <header>
      <h1>견 적 서</h1>
      <div class="meta">
        <div><b>프로젝트</b> {projectName}</div>
        <div><b>작성일</b> {today}</div>
        <div><b>작성자</b> {app.account?.name || app.nickname}{#if app.account} ({app.account.email}){/if}</div>
      </div>
    </header>
    <table>
      <thead><tr><th>#</th><th>항목</th><th>규격·산출</th><th class="r">금액</th></tr></thead>
      <tbody>
        {#each app.objects as o, i (o.id)}
          {@const sz = app.sizeOf(o)}
          {@const lines = q.lines.filter((l) => l.objectId === o.id)}
          {#if lines.length}
            {#each lines as l, j (j)}
              <tr>
                <td>{j === 0 ? i + 1 : ''}</td>
                <td>{l.label}{#if j === 0 && o.text}<small>“{o.text}”</small>{/if}</td>
                <td>{sz ? `${fmt(sz.w)}×${fmt(sz.h)}mm${sz.estimated ? ' (추정)' : ''} · ` : ''}{l.detail}</td>
                <td class="r">{won(l.amount)}</td>
              </tr>
            {/each}
          {/if}
        {/each}
        <tr><td></td><td>설치·운반비</td><td></td><td class="r">{won(q.install)}</td></tr>
        {#each q.extras as e (e.id)}
          <tr><td></td><td>{e.label || '추가 항목'}</td><td></td><td class="r">{won(e.amount)}</td></tr>
        {/each}
      </tbody>
      <tfoot>
        {#if q.vatIncluded}
          <tr><td colspan="3" class="r">합계 (부가세 {won(q.vat)} 포함)</td><td class="r total">{won(q.total)}</td></tr>
        {:else}
          <tr><td colspan="3" class="r">공급가</td><td class="r">{won(q.subtotal)}</td></tr>
          <tr><td colspan="3" class="r">부가세 (10%)</td><td class="r">{won(q.vat)}</td></tr>
          <tr><td colspan="3" class="r">합계</td><td class="r total">{won(q.total)}</td></tr>
        {/if}
      </tfoot>
    </table>
    <p class="note">본 견적은 사진 기반 실측 추정치를 포함할 수 있으며, 현장 실측 후 변동될 수 있습니다.</p>
  </article>
</div>

<style>
  .sheet-wrap { position: fixed; inset: 0; z-index: 70; background: #555; overflow-y: auto; padding: 20px; }
  .toolbar { display: flex; gap: 8px; justify-content: center; margin-bottom: 14px; }
  .paper { background: #fff; color: #111; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 16mm; box-shadow: 0 10px 40px rgba(0,0,0,0.5); font-size: 12px; }
  h1 { text-align: center; letter-spacing: 8px; font-size: 24px; margin: 0 0 18px; }
  .meta { display: flex; gap: 18px; justify-content: space-between; border-top: 2px solid #111; border-bottom: 1px solid #999; padding: 8px 0; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #ccc; padding: 7px 6px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-weight: 600; }
  td small { display: block; color: #666; }
  .r { text-align: right; white-space: nowrap; }
  tfoot td { border-bottom: 0; font-weight: 600; }
  .total { font-size: 15px; }
  .note { color: #666; margin-top: 16px; }
  @media print {
    .no-print { display: none; }
    .sheet-wrap { position: static; background: #fff; padding: 0; }
    .paper { box-shadow: none; width: auto; min-height: auto; margin: 0; padding: 0; }
  }
</style>
