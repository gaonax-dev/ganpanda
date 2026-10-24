<!-- 단가 설정 (편집 권한): 프로젝트 단가표 수정, 소유자는 계정 기본값으로 저장.
  2026-10-16: 공급 단가표(한울 등, 읽기 전용)를 아래에 보이고, 내 단가 항목을 공급 품목에 연결하면 그 단가를 가져오고 꼬리표가 붙는다. 직접 고치면 연결이 풀린다.
  공급사 계산법(글자 크기 구간·폭 구간·헤베+기본가·면적 구간)을 고르면 견적이 그 계산법 × 배수로 나온다("공급사별 계산법을 사용할 수 있게해줘"). -->
<script lang="ts">
  import { nudgeClose } from './dialogGuard';
  import { app } from '../state.svelte';
  import { CATALOG, CATEGORY_LABEL, SHEETS, UNIT_LABEL } from '../core/catalog';
  import { ROUNDING_OPTIONS, mergePrices, type PriceTable } from '../core/pricing';
  import { describeImportError, readPriceTable, type ImportResult } from '../priceImport';
  import { savePrices } from '../auth';
  import { applyMarkup, isDirect, linkedPrice } from '../core/markup';
  import { findMethod, methodsFor } from '../core/calcMethods';
  import { SUPPLIER_LISTS, findSupplierItem, linkableItems, supplierItemLabel, type SupplierItem, type SupplierPriceList } from '../core/supplierPrices';

  // ---- 쓰던 단가표 가져오기 (2026-10-24 "기존에 사용하던 단가를 입력받으면 ai로 이것을 우리의 단가표에 넣어야한다") ----
  let imText = $state('');
  let imFile = $state<File | null>(null);
  let imBusy = $state(false);
  let imError = $state('');
  let imDone = $state('');
  let imResult = $state<ImportResult | null>(null);
  /** 확인 표: 고른 줄과 고친 단가 */
  let imPick = $state<Record<string, boolean>>({});
  let imPrice = $state<Record<string, number>>({});
  let imSaveAccount = $state(true);
  const nameOf = (id: string) => CATALOG.find((c) => c.id === id)?.name ?? SHEETS.find((s) => s.id === id)?.name ?? id;
  const isSheet = (id: string) => SHEETS.some((s) => s.id === id);
  async function runImport() {
    imError = ''; imDone = ''; imResult = null; imBusy = true;
    try {
      const r = await readPriceTable({ text: imText, file: imFile });
      imResult = r;
      imPick = Object.fromEntries(r.items.map((i) => [i.id, true]));
      imPrice = Object.fromEntries(r.items.map((i) => [i.id, i.price]));
      if (!r.items.length) imError = '맞는 항목을 찾지 못했습니다. 아래 "못 찾은 줄"을 보고 단가를 직접 넣어 주세요.';
    } catch (e) { imError = describeImportError(e); }
    finally { imBusy = false; }
  }
  async function applyImport() {
    if (!imResult) return;
    const chosen = imResult.items.filter((i) => imPick[i.id] && Number.isFinite(imPrice[i.id]) && imPrice[i.id] >= 0);
    if (!chosen.length) return;
    const put = (t: PriceTable): PriceTable => {
      const next: PriceTable = { ...t, products: { ...t.products }, sheets: { ...t.sheets }, ...(t.links ? { links: { ...t.links } } : {}) };
      for (const i of chosen) { const v = Math.round(imPrice[i.id]); if (isSheet(i.id)) next.sheets[i.id] = v; else next.products[i.id] = v; if (next.links) delete next.links[i.id]; }
      return next;
    };
    app.setPrices(put(p));
    if (imSaveAccount) { try { const mine = put(mergePrices(app.accountPrices)); await savePrices(mine); app.accountPrices = mine; } catch (e) { imError = describeImportError(e); return; } }
    imDone = `${chosen.length}개 항목을 넣었습니다${imSaveAccount ? ' (이 견적 + 내 단가표)' : ' (이 견적)'}.`;
    imResult = null;
  }
  let saved = $state(false);
  let saving = $state(false);
  const p = $derived(app.prices);

  function set(patch: Partial<PriceTable>) {
    const next = { ...p, ...patch };
    if (!next.links) delete next.links; // 동기화 문서에 undefined 를 남기지 않는다
    if (!next.methods) delete next.methods;
    app.setPrices(next);
  }
  const num = (v: string, fallback: number) => { const n = Number(v); return v.trim() === '' || !isFinite(n) || n < 0 ? fallback : n; };
  const without = (m: Record<string, string> | undefined, id: string) => { const { [id]: _, ...rest } = m ?? {}; return Object.keys(rest).length ? rest : undefined; };
  // 직접 고치면 공급 단가 연결·계산법이 풀린다 (꼬리표 = 공급업체 단가 그대로라는 뜻)
  const setProduct = (id: string, v: string) => set({ products: { ...p.products, [id]: num(v, p.products[id]) }, links: without(p.links, id), methods: without(p.methods, id) });
  const setSheet = (id: string, v: string) => set({ sheets: { ...p.sheets, [id]: num(v, p.sheets[id]) }, links: without(p.links, id), methods: without(p.methods, id) });
  /** 공급 선택: '' = 직접 입력, 'm:<계산법 id>' = 공급사 계산법, 그 밖 = 공급 품목 연결(단가를 가져옴) */
  function link(id: string, kind: 'products' | 'sheets', v: string) {
    if (v.startsWith('m:') && findMethod(v.slice(2))) { set({ methods: { ...(p.methods ?? {}), [id]: v.slice(2) }, links: without(p.links, id) }); return; }
    const hit = findSupplierItem(v);
    if (!hit) { set({ links: without(p.links, id), methods: without(p.methods, id) }); return; }
    set({ [kind]: { ...p[kind], [id]: linkedPrice(p, v) ?? hit.item.price }, links: { ...(p.links ?? {}), [id]: v }, methods: without(p.methods, id) } as Partial<PriceTable>);
  }
  /** 계산법 선택지: 공급업체별로 묶음 */
  function methodChoices(unit: string) {
    const groups = new Map<string, { value: string; label: string }[]>();
    for (const m of methodsFor(unit, p)) {
      const g = `${m.supplier.tag} 계산법`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push({ value: `m:${m.id}`, label: m.label });
    }
    return [...groups];
  }
  /** 배수(사용자가 정함): 비우면 전체 배수를 따른다. 바꾸면 연결된 항목을 다시 계산 */
  const ratio = (v: string): number | null => { const n = Number(v); return v.trim() !== '' && isFinite(n) && n > 0 && n <= 10 ? n : null; };
  function setAll(v: string) { const n = ratio(v); if (n !== null) app.setPrices(applyMarkup(p, { ...(p.markup ?? {}), all: n })); }
  function setGroup(g: string, v: string) {
    const n = ratio(v);
    const groups = { ...(p.markup?.groups ?? {}) };
    if (n === null) delete groups[g]; else groups[g] = n;
    app.setPrices(applyMarkup(p, { ...(p.markup ?? { all: 1 }), groups }));
  }
  /** 직접 출력 분류: 연결 목록에서 빠지고, 이미 연결된 항목은 풀린다(단가는 남음) */
  function setDirect(g: string, on: boolean) {
    const direct = (p.markup?.direct ?? []).filter((x) => x !== g);
    if (on) direct.push(g);
    app.setPrices(applyMarkup(p, { ...(p.markup ?? { all: 1 }), direct }));
  }
  const directOf = (g: string) => !!p.markup?.direct?.includes(g);
  let query = $state('');
  /** 품목 찾기: 띄어쓰기로 나눈 낱말이 모두 분류·이름·세부·비고에 들어 있으면 */
  const matches = (it: SupplierItem) => {
    const hay = `${it.group} ${it.name} ${it.option ?? ''} ${it.note ?? ''}`;
    return query.trim().split(/\s+/).every((w) => !w || hay.includes(w));
  };
  /** 연결 선택지: 공급업체·분류별로 묶음 */
  function choices(unit: string) {
    const groups = new Map<string, { link: string; label: string }[]>();
    for (const c of linkableItems(unit).filter((c) => !isDirect(p, c.item))) {
      const g = `${c.list.supplier.tag} · ${c.item.group}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push({ link: c.link, label: `${c.item.name}${c.item.option ? ` (${c.item.option})` : ''} ${c.item.price.toLocaleString('ko-KR')}원` });
    }
    return [...groups];
  }
  const tagOf = (id: string) => findMethod(p.methods?.[id])?.supplier.tag ?? findSupplierItem(p.links?.[id])?.list.supplier.tag;
  const tagTitle = (id: string) => findMethod(p.methods?.[id])?.label ?? (findSupplierItem(p.links?.[id]) ? supplierItemLabel(findSupplierItem(p.links?.[id])!.item) : '');
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
  {@const mopts = methodChoices(unit)}
  {@const tag = tagOf(id)}
  {@const method = findMethod(p.methods?.[id])}
  <div class="row">
    <span>{name}{#if tag} <span class="tag" data-testid="price-tag-{id}" title={tagTitle(id)}>{tag}</span>{/if}</span>
    {#if method}
      <input data-testid="price-{id}" disabled value="" placeholder="계산법" title={method.label} />
    {:else}
      <input data-testid="price-{id}" type="number" min="0" step="100" value={p[kind][id]} oninput={(e) => (kind === 'products' ? setProduct : setSheet)(id, e.currentTarget.value)} />
    {/if}
    <small>{unitLabel}</small>
    {#if opts.length || mopts.length}
      <select data-testid="price-link-{id}" title="공급 단가 연결·계산법" value={method ? `m:${method.id}` : (p.links?.[id] ?? '')} onchange={(e) => link(id, kind, e.currentTarget.value)}>
        <option value="">직접 입력</option>
        {#each mopts as [g, xs] (g)}<optgroup label={g}>{#each xs as x (x.value)}<option value={x.value}>{x.label}</option>{/each}</optgroup>{/each}
        {#each opts as [g, xs] (g)}<optgroup label={g}>{#each xs as x (x.link)}<option value={x.link}>{x.label}</option>{/each}</optgroup>{/each}
      </select>
    {:else}<span></span>{/if}
  </div>
{/snippet}

<div class="backdrop" role="presentation" onpointerdown={nudgeClose}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="단가 설정">
    <header><h2>단가 설정</h2><button class="icon" data-close data-testid="close-prices" title="닫기" onclick={() => (app.pricesOpen = false)}>✕</button></header>
    <div class="body">
      <section class="import" data-testid="prices-import">
        <h3>쓰던 단가표 가져오기 <small>AI 가 읽어 아래 항목에 맞춥니다 — 엑셀(.xlsx)·CSV·사진·PDF·글</small></h3>
        <textarea data-testid="import-text" rows="3" bind:value={imText} placeholder="엑셀·카톡·메모에서 복사해 붙여 넣기 (예: 갈바 간판  회배 65,000)"></textarea>
        <div class="imrow">
          <input data-testid="import-file" type="file" accept=".xlsx,.csv,.txt,image/*,application/pdf" onchange={(e) => (imFile = e.currentTarget.files?.[0] ?? null)} />
          <button class="btn primary small" data-testid="import-run" disabled={imBusy || (!imText.trim() && !imFile)} onclick={runImport}>{imBusy ? '읽는 중…' : 'AI로 읽기'}</button>
        </div>
        {#if imError}<p class="hint err" data-testid="import-error">{imError}</p>{/if}
        {#if imDone}<p class="hint ok" data-testid="import-done">{imDone}</p>{/if}
        {#if imResult?.engine === 'workers'}<p class="hint warn" data-testid="import-engine-note">보조 AI 로 읽었습니다 — 표가 복잡하면 틀릴 수 있으니 넣을 단가를 꼭 확인해 주세요.</p>{/if}
        {#if imResult?.items.length}
          <table class="imtable">
            <thead><tr><th></th><th>항목</th><th>지금</th><th>넣을 단가</th><th>원문</th></tr></thead>
            <tbody>
              {#each imResult.items as i (i.id)}
                <tr data-testid="import-row" data-id={i.id}>
                  <td><input type="checkbox" data-testid="import-pick" bind:checked={imPick[i.id]} /></td>
                  <td>{nameOf(i.id)}</td>
                  <td class="r muted">{(isSheet(i.id) ? p.sheets[i.id] : p.products[i.id])?.toLocaleString('ko-KR') ?? '—'}</td>
                  <td><input data-testid="import-price" type="number" min="0" step="100" bind:value={imPrice[i.id]} /></td>
                  <td class="muted">{i.sourceLabel} · {i.sourcePrice}{#if i.note}<br /><small>{i.note}</small>{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="imrow"><label class="check"><input type="checkbox" data-testid="import-save-account" bind:checked={imSaveAccount} /> 내 단가표에도 저장 (새 프로젝트)</label>
            <button class="btn primary small" data-testid="import-apply" onclick={applyImport}>적용</button></p>
        {/if}
        {#if imResult?.unmatched.length}
          <details data-testid="import-unmatched" open={!imResult.items.length}><summary>못 찾은 줄 {imResult.unmatched.length}개 — 아래 표에 직접 넣어 주세요</summary>
            <ul>{#each imResult.unmatched as u, k (k)}<li>{u.label} · {u.price}</li>{/each}</ul></details>
        {/if}
      </section>
      {#each ['board', 'channel', 'light', 'part'] as const as cat (cat)}
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
        <h3>공급 단가표 <span class="sub">참고용 · 위 항목의 선택에서 공급 품목(단가 × 배수)이나 공급사 계산법(구간·기본가 × 배수)을 고르면 꼬리표가 붙습니다 (회배 = 1㎡)</span></h3>
        <div class="markup" data-testid="markup">
          <label>전체 배수 ×<input data-testid="markup-all" type="number" min="0.1" max="10" step="0.05" value={p.markup?.all ?? 1} onchange={(e) => setAll(e.currentTarget.value)} /></label>
          <small>연결한 항목 = 공급 단가 × 배수 (100원 단위). 분류 배수(공급업체를 펼쳐 분류마다)를 비우면 전체 배수. 직접 출력 분류는 연결하지 않고 직접 입력합니다</small>
        </div>
        {#each SUPPLIER_LISTS as l (l.supplier.id)}
          <div class="supplier" data-testid="supplier-list-{l.supplier.id}">
            <button class="sup-head" data-testid="supplier-toggle-{l.supplier.id}" onclick={() => (openList = openList === l.supplier.id ? null : l.supplier.id)}>
              <span class="tag">{l.supplier.tag}</span> {l.supplier.name} <small>{l.effectiveDate} · {l.items.length}품목</small><span class="caret">{openList === l.supplier.id ? '▾' : '▸'}</span>
            </button>
            {#if openList === l.supplier.id}
              <input class="search" data-testid="supplier-search" placeholder="품목 찾기 (예: 채널, 80cm, 백색)" bind:value={query} />
              {#each groupsOf(l) as g (g)}
                {@const rows = l.items.filter((i) => i.group === g && matches(i))}
                {#if rows.length}
                <div class="gh">
                  <h4>{g}</h4>
                  <label class="d"><input type="checkbox" data-testid="direct-{g}" checked={directOf(g)} onchange={(e) => setDirect(g, e.currentTarget.checked)} /> 직접 출력</label>
                  {#if !directOf(g)}<label class="d">×<input data-testid="markup-{g}" type="number" min="0.1" max="10" step="0.05" placeholder={String(p.markup?.all ?? 1)} value={p.markup?.groups?.[g] ?? ''} onchange={(e) => setGroup(g, e.currentTarget.value)} /></label>{/if}
                </div>
                <table><tbody>
                  {#each rows as it (it.id)}
                    <tr data-testid="supplier-item" title={it.note ?? ''}>
                      <td>{it.name}{#if it.option} <small>({it.option})</small>{/if}{#if it.surcharge} <em>추가</em>{/if}</td>
                      <td class="w">{it.maxWidthMm ? `${it.maxWidthMm.toLocaleString('ko-KR')}폭` : ''}</td>
                      <td class="r">{it.surcharge ? '+' : ''}{it.price.toLocaleString('ko-KR')}원/{it.note?.includes('자당') ? '자' : it.unit}</td>
                    </tr>
                  {/each}
                </tbody></table>
                {/if}
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
  .import { border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line)); border-radius: 10px; padding: 10px; }
  .import textarea { width: 100%; box-sizing: border-box; }
  .imrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 6px 0; }
  .imtable { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
  .imtable th, .imtable td { padding: 4px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
  .imtable input[type='number'] { width: 96px; }
  .imtable .r { text-align: right; }
  .muted { color: var(--muted); }
  .hint.err { color: var(--danger, #dc2626); }
  .hint.ok { color: var(--ok, #22c55e); }
  .hint.warn { color: #b45309; }
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(640px, calc(100vw - 32px)); max-height: calc(100dvh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
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
  .markup { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin: 4px 0 8px; font-size: 12px; color: var(--text); }
  .markup label { display: flex; flex-direction: row; align-items: center; gap: 3px; }
  .markup input { width: 58px; }
  .markup small { flex-basis: 100%; color: var(--muted); font-size: 11px; }
  .supplier { border: 1px solid var(--line); border-radius: 8px; margin: 6px 0; }
  .sup-head { display: flex; align-items: center; gap: 6px; width: 100%; background: none; border: 0; color: var(--text); padding: 8px; font-size: 13px; cursor: pointer; text-align: left; }
  .sup-head small { color: var(--muted); }
  .caret { margin-left: auto; color: var(--muted); }
  h4 { font-size: 11px; color: var(--muted); margin: 0; }
  .gh { display: flex; align-items: center; gap: 10px; margin: 10px 8px 2px; }
  .gh .d { display: flex; flex-direction: row; align-items: center; gap: 3px; font-size: 11px; color: var(--muted); }
  .gh input[type='number'] { width: 56px; }
  .search { margin: 0 8px 4px; width: calc(100% - 16px); }
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
