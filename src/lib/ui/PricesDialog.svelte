<!-- 단가 설정 (편집 권한): 프로젝트 단가표 수정, 소유자는 계정 기본값으로 저장 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { CATALOG, CATEGORY_LABEL, SHEETS, UNIT_LABEL } from '../core/catalog';
  import { ROUNDING_OPTIONS, type PriceTable } from '../core/pricing';
  import { savePrices } from '../auth';

  let saved = $state(false);
  let saving = $state(false);
  const p = $derived(app.prices);

  function set(patch: Partial<PriceTable>) { app.setPrices({ ...p, ...patch }); }
  const num = (v: string, fallback: number) => { const n = Number(v); return v.trim() === '' || !isFinite(n) || n < 0 ? fallback : n; };
  const setProduct = (id: string, v: string) => set({ products: { ...p.products, [id]: num(v, p.products[id]) } });
  const setSheet = (id: string, v: string) => set({ sheets: { ...p.sheets, [id]: num(v, p.sheets[id]) } });

  async function saveDefault() {
    saving = true;
    try { await savePrices(p); app.accountPrices = p; saved = true; setTimeout(() => (saved = false), 2500); }
    finally { saving = false; }
  }
</script>

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) app.pricesOpen = false; }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="단가 설정">
    <header><h2>단가 설정</h2><button class="icon" data-testid="close-prices" title="닫기" onclick={() => (app.pricesOpen = false)}>✕</button></header>
    <div class="body">
      {#each ['board', 'channel'] as const as cat (cat)}
        <section>
          <h3>{CATEGORY_LABEL[cat]}</h3>
          {#each CATALOG.filter((x) => x.category === cat) as item (item.id)}
            <label class="row"><span>{item.name}</span>
              <input data-testid="price-{item.id}" type="number" min="0" step="100" value={p.products[item.id]} oninput={(e) => setProduct(item.id, e.currentTarget.value)} />
              <small>{UNIT_LABEL[item.unit]}</small></label>
          {/each}
        </section>
      {/each}
      <section>
        <h3>시트</h3>
        {#each SHEETS as sh (sh.id)}
          <label class="row"><span>{sh.name}</span>
            <input data-testid="price-{sh.id}" type="number" min="0" step="100" value={p.sheets[sh.id]} oninput={(e) => setSheet(sh.id, e.currentTarget.value)} />
            <small>원/㎡</small></label>
        {/each}
      </section>
      <section>
        <h3>공통</h3>
        <label class="row"><span>기본 설치·운반비</span><input data-testid="price-install" type="number" min="0" step="1000" value={p.install} oninput={(e) => set({ install: num(e.currentTarget.value, p.install) })} /><small>원/프로젝트</small></label>
        <label class="row"><span>항목 최소 금액</span><input data-testid="price-minimum" type="number" min="0" step="1000" value={p.minimum} oninput={(e) => set({ minimum: num(e.currentTarget.value, p.minimum) })} /><small>원</small></label>
        <label class="row"><span>금액 반올림 단위</span>
          <select value={String(p.rounding)} onchange={(e) => set({ rounding: Number(e.currentTarget.value) as PriceTable['rounding'] })}>
            {#each ROUNDING_OPTIONS as r (r)}<option value={String(r)}>{r.toLocaleString('ko-KR')}원</option>{/each}
          </select><small></small></label>
        <label class="check"><input data-testid="price-vat-included" type="checkbox" checked={p.vatIncluded} onchange={(e) => set({ vatIncluded: e.currentTarget.checked })} /> 단가가 부가세 포함가입니다 (합계 = 공급가, 부가세는 안내만)</label>
      </section>
    </div>
    <footer>
      <span class="hint">이 프로젝트에 바로 적용됩니다. 고객도 같은 단가로 견적을 봅니다.</span>
      {#if app.role === 'owner'}
        <button class="btn" data-testid="save-default-prices" disabled={saving} onclick={saveDefault}>내 기본 단가로 저장</button>
        {#if saved}<span class="ok" data-testid="prices-saved">저장됨 ✓ 새 프로젝트에 적용</span>{/if}
      {/if}
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 16px; }
  .body { overflow-y: auto; padding: 4px 16px 12px; }
  section { margin-top: 12px; }
  h3 { font-size: 12px; color: var(--muted); margin: 0 0 6px; font-weight: 600; }
  .row { display: grid; grid-template-columns: 1fr 140px 70px; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; color: var(--text); }
  .row input, .row select { width: 100%; }
  .row small { color: var(--muted); font-size: 11px; }
  .check { flex-direction: row; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; color: var(--text); }
  footer { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--line); flex-wrap: wrap; }
  .hint { flex: 1; }
  .ok { color: var(--ok); font-size: 12px; }
</style>
