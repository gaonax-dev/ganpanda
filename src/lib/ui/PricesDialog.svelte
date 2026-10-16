<!-- 단가 설정 (편집 권한): 프로젝트 단가표 수정, 소유자는 계정 기본값으로 저장.
  2026-10-16: 공급 단가표(한울 등, 읽기 전용)를 아래에 보이고, 내 단가 항목을 공급 품목에 연결하면 그 단가를 가져오고 꼬리표가 붙는다. 직접 고치면 연결이 풀린다. -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { CATALOG, CATEGORY_LABEL, SHEETS, UNIT_LABEL } from '../core/catalog';
  import { ROUNDING_OPTIONS, type PriceTable } from '../core/pricing';
  import { savePrices } from '../auth';
  import { SUPPLIER_LISTS, findSupplierItem, linkableItems, supplierItemLabel, type SupplierPriceList } from '../core/supplierPrices';

  let saved = $state(false);
  let saving = $state(false);
  const p = $derived(app.prices);

  function set(patch: Partial<PriceTable>) {
    const next = { ...p, ...patch };
    if (!next.links) delete next.links; // 동기화 문서에 undefined 를 남기지 않는다
    app.setPrices(next);
  }
  const num = (v: string, fallback: number) => { const n = Number(v); return v.trim() === '' || !isFinite(n) || n < 0 ? fallback : n; };
  const unlinked = (id: string) => { const { [id]: _, ...rest } = p.links ?? {}; return Object.keys(rest).length ? rest : undefined; };
  // 직접 고치면 공급 단가 연결이 풀린다 (꼬리표 = 공급업체 단가 그대로라는 뜻)
  const setProduct = (id: string, v: string) => set({ products: { ...p.products, [id]: num(v, p.products[id]) }, links: unlinked(id) });
  const setSheet = (id: string, v: string) => set({ sheets: { ...p.sheets, [id]: num(v, p.sheets[id]) }, links: unlinked(id) });
  /** 공급 품목 연결: 단가를 가져오고 연결을 남긴다. '' = 직접 입력 */
  function link(id: string, kind: 'products' | 'sheets', v: string) {
    const hit = findSupplierItem(v);
    if (!hit) { set({ links: unlinked(id) }); return; }
    set({ [kind]: { ...p[kind], [id]: hit.item.price }, links: { ...(p.links ?? {}), [id]: v } } as Partial<PriceTable>);
  }
  /** 연결 선택지: 공급업체·분류별로 묶음 */
  function choices(unit: string) {
    const groups = new Map<string, { link: string; label: string }[]>();
    for (const c of linkableItems(unit)) {
      const g = `${c.list.supplier.tag} · ${c.item.group}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push({ link: c.link, label: `${c.item.name}${c.item.option ? ` (${c.item.option})` : ''} ${c.item.price.toLocaleString('ko-KR')}원` });
    }
    return [...groups];
  }
  const tagOf = (id: string) => findSupplierItem(p.links?.[id])?.list.supplier.tag;
  const groupsOf = (l: SupplierPriceList) => [...new Set(l.items.map((i) => i.group))];
  let openList = $state<string | null>(null);

  async function saveDefault() {
    saving = true;
    try { await savePrices(p); app.accountPrices = p; saved = true; setTimeout(() => (saved = false), 2500); }
    finally { saving = false; }
  }
</script>

{#snippet row(id: string, name: string, unit: string, unitLabel: string, kind: 'products' | 'sheets')}
  {@const opts = choices(unit)}
  {@const tag = tagOf(id)}
  <div class="row">
    <span>{name}{#if tag} <span class="tag" data-testid="price-tag-{id}" title={supplierItemLabel(findSupplierItem(p.links?.[id])!.item)}>{tag}</span>{/if}</span>
    <input data-testid="price-{id}" type="number" min="0" step="100" value={p[kind][id]} oninput={(e) => (kind === 'products' ? setProduct : setSheet)(id, e.currentTarget.value)} />
    <small>{unitLabel}</small>
    {#if opts.length}
      <select data-testid="price-link-{id}" title="공급 단가 연결" value={p.links?.[id] ?? ''} onchange={(e) => link(id, kind, e.currentTarget.value)}>
        <option value="">직접 입력</option>
        {#each opts as [g, xs] (g)}<optgroup label={g}>{#each xs as x (x.link)}<option value={x.link}>{x.label}</option>{/each}</optgroup>{/each}
      </select>
    {:else}<span></span>{/if}
  </div>
{/snippet}

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) app.pricesOpen = false; }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="단가 설정">
    <header><h2>단가 설정</h2><button class="icon" data-testid="close-prices" title="닫기" onclick={() => (app.pricesOpen = false)}>✕</button></header>
    <div class="body">
      {#each ['board', 'channel', 'light'] as const as cat (cat)}
        <section>
          <h3>{CATEGORY_LABEL[cat]}</h3>
          {#each CATALOG.filter((x) => x.category === cat && x.unit !== 'none') as item (item.id)}
            {@render row(item.id, item.name, item.unit, UNIT_LABEL[item.unit], 'products')}
          {/each}
        </section>
      {/each}
      <section>
        <h3>시트</h3>
        {#each SHEETS as sh (sh.id)}
          {@render row(sh.id, sh.name, 'm2', '원/㎡', 'sheets')}
        {/each}
      </section>
      <section data-testid="supplier-lists">
        <h3>공급 단가표 <span class="sub">참고용 · 위 항목의 "공급 단가"에서 연결하면 그 단가와 꼬리표가 붙습니다 (회배 = 1㎡)</span></h3>
        {#each SUPPLIER_LISTS as l (l.supplier.id)}
          <div class="supplier" data-testid="supplier-list-{l.supplier.id}">
            <button class="sup-head" data-testid="supplier-toggle-{l.supplier.id}" onclick={() => (openList = openList === l.supplier.id ? null : l.supplier.id)}>
              <span class="tag">{l.supplier.tag}</span> {l.supplier.name} <small>{l.effectiveDate} · {l.items.length}품목</small><span class="caret">{openList === l.supplier.id ? '▾' : '▸'}</span>
            </button>
            {#if openList === l.supplier.id}
              {#each groupsOf(l) as g (g)}
                <h4>{g}</h4>
                <table><tbody>
                  {#each l.items.filter((i) => i.group === g) as it (it.id)}
                    <tr data-testid="supplier-item" title={it.note ?? ''}>
                      <td>{it.name}{#if it.option} <small>({it.option})</small>{/if}{#if it.surcharge} <em>추가</em>{/if}</td>
                      <td class="w">{it.maxWidthMm ? `${it.maxWidthMm.toLocaleString('ko-KR')}폭` : ''}</td>
                      <td class="r">{it.surcharge ? '+' : ''}{it.price.toLocaleString('ko-KR')}원/{it.unit}</td>
                    </tr>
                  {/each}
                </tbody></table>
              {/each}
            {/if}
          </div>
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
  .dialog { width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  h2 { margin: 0; font-size: 16px; }
  .body { overflow-y: auto; padding: 4px 16px 12px; }
  section { margin-top: 12px; }
  h3 { font-size: 12px; color: var(--muted); margin: 0 0 6px; font-weight: 600; }
  .row { display: grid; grid-template-columns: 1fr 110px 56px 150px; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; color: var(--text); }
  .row input, .row select { width: 100%; }
  .row small { color: var(--muted); font-size: 11px; }
  .row select { font-size: 11px; }
  @media (max-width: 560px) { .row { grid-template-columns: 1fr 100px 50px; } .row select { grid-column: 1 / -1; } }
  .tag { display: inline-block; padding: 0 5px; border-radius: 4px; background: var(--accent, #3b82f6); color: #fff; font-size: 10px; font-weight: 700; vertical-align: 1px; }
  .sub { font-weight: 400; margin-left: 4px; }
  .supplier { border: 1px solid var(--line); border-radius: 8px; margin: 6px 0; }
  .sup-head { display: flex; align-items: center; gap: 6px; width: 100%; background: none; border: 0; color: var(--text); padding: 8px; font-size: 13px; cursor: pointer; text-align: left; }
  .sup-head small { color: var(--muted); }
  .caret { margin-left: auto; color: var(--muted); }
  h4 { font-size: 11px; color: var(--muted); margin: 8px 8px 2px; }
  table { width: calc(100% - 16px); margin: 0 8px 4px; border-collapse: collapse; font-size: 12px; }
  td { padding: 2px 4px; border-top: 1px solid var(--line); color: var(--text); }
  td small, td em { color: var(--muted); font-style: normal; font-size: 11px; }
  td.w { color: var(--muted); width: 70px; }
  td.r { text-align: right; white-space: nowrap; width: 110px; }
  .check { flex-direction: row; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; color: var(--text); }
  footer { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--line); flex-wrap: wrap; }
  .hint { flex: 1; }
  .ok { color: var(--ok); font-size: 12px; }
</style>
