<!-- 견적서 (인쇄·PDF): 브라우저 인쇄로 저장 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { won } from '../core/quote';
  import { DELIVERY_LABEL, FILE_CHECK, orderJson } from '../core/order';
  import { describeOptions } from '../core/options';

  const q = $derived(app.quote);
  const today = new Date().toLocaleDateString('ko-KR');
  const projectName = $derived(app.access.status === 'ok' ? app.access.projectName : '');
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const order = $derived(app.settings.order ?? {});
  const hasOrder = $derived(!!(order.customer || order.company || order.phone || order.address || order.dueDate || order.delivery));
  function exportJson() {
    const json = orderJson({ projectName, signs: app.signs, sizeOf: (o) => app.sizeOf(o), sources: app.sources, quote: q, order });
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${projectName || '주문'}_주문서_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
</script>

<div class="sheet-wrap" data-testid="quote-sheet">
  <div class="toolbar no-print">
    <button class="btn primary" onclick={() => window.print()}>인쇄 · PDF 저장</button>
    <button class="btn" data-testid="order-json" title="주문 데이터(JSON) 내려받기" onclick={exportJson}>JSON 내보내기</button>
    <button class="btn" data-testid="close-quote-sheet" onclick={() => (app.quoteSheetOpen = false)}>닫기</button>
  </div>
  <article class="paper">
    <header>
      <h1>{hasOrder ? '주 문 서' : '견 적 서'}</h1>
      <div class="meta">
        <div><b>프로젝트</b> {projectName}</div>
        <div><b>작성일</b> {today}</div>
        <div><b>작성자</b> {app.account?.name || app.nickname}{#if app.account} ({app.account.email}){/if}</div>
      </div>
      {#if hasOrder}
        <div class="order" data-testid="order-info">
          <div><b>주문자</b> {order.customer ?? ''}{#if order.company} · {order.company}{/if}</div>
          <div><b>연락처</b> {order.phone ?? ''}</div>
          <div><b>배송·시공</b> {order.delivery ? DELIVERY_LABEL[order.delivery] : ''}{#if order.address} · {order.address}{/if}</div>
          <div><b>납기 희망일</b> {order.dueDate ?? ''}</div>
        </div>
      {/if}
    </header>
    <table>
      <thead><tr><th>#</th><th>항목</th><th>규격·산출</th><th class="r">금액</th></tr></thead>
      <tbody>
        {#each app.signs as o, i (o.id)}
          {@const sz = app.sizeOf(o)}
          {@const lines = q.lines.filter((l) => l.objectId === o.id)}
          {#if lines.length}
            {#each lines as l, j (j)}
              <tr>
                <td>{j === 0 ? i + 1 : ''}</td>
                <td>{l.label}{#if j === 0 && o.text}<small>“{o.text}”</small>{/if}{#if j === 0}{@const spec = describeOptions(o, { defaults: true })}{#if spec.length}<small>{spec.join(' · ')}</small>{/if}{/if}{#if j === 0 && o.design}{@const src = app.sources.find((s) => s.id === o.design!.sourceId)}{#if src}<small>디자인: {src.name} ({o.design.page + 1}쪽)</small>{/if}{/if}{#if j === 0 && o.note}<small>요청: {o.note}</small>{/if}</td>
                <td>{sz ? `${fmt(sz.w)}×${fmt(sz.h)}${o.depthMm ? `×${fmt(o.depthMm)}` : ''}mm${sz.estimated ? ' (추정)' : ''} · ` : ''}{l.detail}</td>
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
    {#if order.notes}<p class="req"><b>추가 요청사항</b> {order.notes}</p>{/if}
    {#if app.sources.length}<p class="files"><b>첨부 파일</b> {app.sources.map((s) => `${s.name} (${s.pages.length}쪽)`).join(', ')}</p>{/if}
    <p class="check"><b>작업 파일 체크</b> {FILE_CHECK.join(' · ')}</p>
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
  .order { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; border-bottom: 1px solid #999; padding: 6px 0 10px; margin-bottom: 14px; }
  .req, .files, .check { margin: 10px 0 0; color: #333; }
  .check { color: #666; font-size: 11px; }
  @media print {
    .no-print { display: none; }
    .sheet-wrap { position: static; background: #fff; padding: 0; }
    .paper { box-shadow: none; width: auto; min-height: auto; margin: 0; padding: 0; }
  }
</style>
