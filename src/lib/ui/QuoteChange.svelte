<!-- 계약 견적(기준) 대비 변경 견적의 차이 + 고객 안전장치 (2026-10-26 "고객이 간판업체의 견적을 선택한 경우 해당 견적을 기준으로 이후 변경 견적의 차이를 쉽게 확인 …
  고객에게 손해가 나거나 변경을 이해하지 못하게 복잡한 변경을 시스탬적으로 잡아내서 고객에게 안전장치"). 사장 화면(발행 전 미리보기)과 고객 화면이 같이 쓴다 -->
<script lang="ts">
  import type { ItemField, QuoteDiff, Risk } from '../core/quoteChange';
  let { diff, risks, baseLabel = '계약 견적', nextLabel = '변경 견적' }: { diff: QuoteDiff; risks: Risk[]; baseLabel?: string; nextLabel?: string } = $props();
  const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
  const sign = (n: number) => (n > 0 ? `+${won(n)}` : n < 0 ? `−${won(-n)}` : '0원');
  const FIELD: Record<ItemField, string> = { size: '크기', type: '종류', category: '분류', sheets: '시트', options: '옵션', text: '문구', design: '디자인', amount: '금액' };
  const show = (f: ItemField, v: string | number) => (f === 'amount' ? won(v as number) : f === 'size' ? (v ? `${String(v).replace('×', ' × ')} mm` : '없음') : v === '' ? '없음' : String(v));
  const riskOf = (id: string) => risks.filter((r) => r.itemId === id);
  const general = $derived(risks.filter((r) => !r.itemId));
  const danger = $derived(risks.some((r) => r.level === 'danger'));
</script>

<section class="change" data-testid="quote-change">
  <div class="sum">
    <span>{baseLabel} <b>{won(diff.totalBefore)}</b></span>
    <span class="arrow">→</span>
    <span>{nextLabel} <b>{won(diff.totalAfter)}</b></span>
    <span class="delta" class:up={diff.totalDelta > 0} class:down={diff.totalDelta < 0} data-testid="quote-change-delta">{sign(diff.totalDelta)}</span>
  </div>
  {#if risks.length}
    <div class="risks" class:danger data-testid="quote-change-risks">
      <b>{danger ? '⚠ 꼭 확인하세요' : '확인하세요'}</b>
      <ul>{#each risks as r, i (i)}<li class={r.level} data-testid="quote-risk" data-code={r.code} data-level={r.level}>{r.message}</li>{/each}</ul>
    </div>
  {/if}
  {#if diff.items.length}
    <ul class="items">
      {#each diff.items as c (c.id)}
        <li class={c.kind} data-testid="quote-change-item" data-kind={c.kind} class:risky={riskOf(c.id).some((r) => r.level === 'danger')}>
          <div class="head"><b>{c.name}</b><span class="tag">{c.kind === 'added' ? '추가' : c.kind === 'removed' ? '빠짐' : '변경'}</span><span class="d">{sign(c.amountDelta)}</span></div>
          {#if c.kind === 'changed'}
            <table><tbody>{#each c.fields as f (f.field)}<tr><td>{FIELD[f.field]}</td><td class="b">{show(f.field, f.before)}</td><td>→</td><td class="a">{show(f.field, f.after)}</td></tr>{/each}</tbody></table>
          {/if}
        </li>
      {/each}
    </ul>
    {#if diff.unchanged}<small class="same">그대로인 사인물 {diff.unchanged}개</small>{/if}
  {:else}
    <small class="same">사인물은 그대로입니다{general.length ? '' : ' — 바뀐 것이 없습니다'}.</small>
  {/if}
</section>

<style>
  .change { display: flex; flex-direction: column; gap: 8px; }
  .sum { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 13px; }
  .sum b { font-size: 15px; }
  .arrow { color: var(--muted); }
  .delta { font-weight: 800; padding: 1px 8px; border-radius: 9px; background: color-mix(in srgb, var(--text) 10%, transparent); }
  .delta.up { color: #fca5a5; background: rgba(239, 68, 68, 0.15); }
  .delta.down { color: #86efac; background: rgba(34, 197, 94, 0.15); }
  .risks { border: 1px solid #f59e0b; background: rgba(245, 158, 11, 0.1); border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .risks.danger { border-color: #ef4444; background: rgba(239, 68, 68, 0.12); }
  .risks ul { margin: 4px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
  .risks li.danger { color: #fca5a5; font-weight: 700; }
  .risks li.info { color: var(--muted); }
  .items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .items li { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: 13px; }
  .items li.risky { border-color: #ef4444; }
  .head { display: flex; align-items: center; gap: 6px; }
  .head b { flex: 1; min-width: 0; }
  .tag { font-size: 11px; font-weight: 700; padding: 0 7px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 20%, transparent); }
  li.removed .tag { background: rgba(148, 163, 184, 0.25); }
  li.added .tag { background: rgba(59, 130, 246, 0.25); }
  .d { font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
  td { padding: 2px 4px; }
  td:first-child { color: var(--muted); width: 3.5em; }
  td.b { color: var(--muted); text-decoration: line-through; }
  td.a { font-weight: 700; }
  .same { color: var(--muted); font-size: 12px; }
</style>
