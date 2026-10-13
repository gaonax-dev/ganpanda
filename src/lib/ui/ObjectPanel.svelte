<!-- 선택한 사인물: 종류·시트·치수·실측 경고 + 대화 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { CATALOG, CATEGORY_LABEL, SHEETS, productById, type Category } from '../core/catalog';
  import { charCountOf, quoteObject, won } from '../core/quote';
  import { specFromObject } from '../core/letter3d';
  import type { SignObject } from '../core/model';
  import Chat from './Chat.svelte';

  let { obj }: { obj: SignObject } = $props();

  // 패널이 열려 있는 동안 이 사인물의 새 메시지는 읽은 것으로
  $effect(() => { app.messages; app.markSeen(obj.id); });

  const product = $derived(productById(obj.productId));
  const category = $derived<Category | null>(product?.category ?? null);
  const m = $derived(app.measures.get(obj.id));
  // 입력 치수가 없으면 판독 추정 치수로 계산 (리스트 견적과 동일 규칙)
  const size = $derived(app.sizeOf(obj));
  const lines = $derived(quoteObject(size ? { ...obj, widthMm: size.w, heightMm: size.h } : obj, app.prices));
  const autoChars = $derived(charCountOf({ text: obj.text }));
  const can3d = $derived(category === 'channel' && !!specFromObject(obj));
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  const ro = $derived(!app.canEdit);
  const update = (patch: Partial<SignObject>) => { if (app.canEdit) app.project.updateObject(obj.id, patch); };
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)));

  function setCategory(c: Category | null) {
    if (c === category) return;
    update({ productId: c ? CATALOG.find((p) => p.category === c)!.id : undefined });
  }
  function toggleSheet(id: string) {
    const has = obj.sheetIds.includes(id);
    update({ sheetIds: has ? obj.sheetIds.filter((s) => s !== id) : [...obj.sheetIds, id] });
  }
</script>

<aside class="panel" data-testid="object-panel">
  <header>
    <input class="title" value={obj.name} disabled={ro} onchange={(e) => update({ name: e.currentTarget.value || obj.name })} />
    <button class="icon" title="닫기" onclick={() => app.selectObject(null)}>✕</button>
  </header>

  <section>
    <h3>간판 종류</h3>
    <div class="seg">
      <button class:on={category === null} disabled={ro} onclick={() => setCategory(null)}>없음</button>
      {#each Object.entries(CATEGORY_LABEL) as [c, label] (c)}
        <button data-testid="category-{c}" class:on={category === c} disabled={ro} onclick={() => setCategory(c as Category)}>{label}</button>
      {/each}
    </div>
    {#if can3d}
      <button class="btn small" data-testid="open-letter3d" onclick={() => (app.letter3dOpen = true)}>입체 보기 (3D)</button>
    {/if}
    {#if category}
      <select data-testid="product-select" value={obj.productId} disabled={ro} onchange={(e) => update({ productId: e.currentTarget.value })}>
        {#each CATALOG.filter((p) => p.category === category) as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    {/if}
  </section>

  <section>
    <h3>문구</h3>
    <input data-testid="sign-text" value={obj.text ?? ''} placeholder="간판에 들어갈 글자 (예: 간판다 카페)" disabled={ro}
      oninput={(e) => update({ text: e.currentTarget.value })} />
  </section>

  <section>
    <h3>시트</h3>
    <div class="chips">
      {#each SHEETS as s (s.id)}
        <button data-testid="sheet-{s.id}" class:on={obj.sheetIds.includes(s.id)} disabled={ro} onclick={() => toggleSheet(s.id)}>{s.name}</button>
      {/each}
    </div>
  </section>

  <section>
    <h3>
      치수 (mm)
      {#if m?.reference}<span class="badge" data-testid="reference-badge" title="이 사진의 다른 영역은 이 치수를 기준으로 추정합니다">{m.refAxes ? `기준 (${m.refAxes.map((a) => (a === 'h' ? '가로' : '세로')).join('·')})` : '기준 영역'}</span>{/if}
    </h3>
    <div class="grid2">
      <label>가로
        <input data-testid="width-mm" type="number" min="0" step="10" value={obj.widthMm ?? ''} disabled={ro}
          placeholder={m?.estimate ? `≈ ${fmt(m.estimate.widthMm)}` : '입력'}
          oninput={(e) => update({ widthMm: num(e.currentTarget.value) })} />
      </label>
      <label>세로
        <input data-testid="height-mm" type="number" min="0" step="10" value={obj.heightMm ?? ''} disabled={ro}
          placeholder={m?.estimate ? `≈ ${fmt(m.estimate.heightMm)}` : '입력'}
          oninput={(e) => update({ heightMm: num(e.currentTarget.value) })} />
      </label>
      {#if category === 'channel'}
        <label>글자수
          <input data-testid="char-count" type="number" min="0" value={obj.charCount ?? ''} disabled={ro}
            placeholder={autoChars ? `자동 ${autoChars}` : '문구 입력'} oninput={(e) => update({ charCount: num(e.currentTarget.value) })} />
        </label>
      {/if}
    </div>
    {#if obj.widthMm && obj.heightMm && !ro}
      <div class="refs">
        <label class="check"><input type="checkbox" data-testid="ref-h" checked={!!obj.refH} onchange={(e) => update({ refH: e.currentTarget.checked || undefined })} /> 가로 기준 (위·아래 변 = {obj.widthMm.toLocaleString('ko-KR')}mm 확실)</label>
        <label class="check"><input type="checkbox" data-testid="ref-v" checked={!!obj.refV} onchange={(e) => update({ refV: e.currentTarget.checked || undefined })} /> 세로 기준 (좌·우 변 = {obj.heightMm.toLocaleString('ko-KR')}mm 확실)</label>
      </div>
    {/if}
    {#each m?.warnings ?? [] as w, i (i)}
      <div class="warning" data-testid="measure-warning">
        <b>⚠ 실측 확인 필요</b>
        <p>{w.message}</p>
        <button data-testid="apply-estimate" class="btn small" disabled={ro}
          onclick={() => update({ widthMm: Math.round(w.expected.widthMm / 10) * 10, heightMm: Math.round(w.expected.heightMm / 10) * 10 })}>
          추정값 적용 ({fmt(w.expected.widthMm)}×{fmt(w.expected.heightMm)})
        </button>
      </div>
    {/each}
    {#if !obj.widthMm && !obj.heightMm && !m?.estimate}
      <p class="hint">한 영역의 실제 치수를 입력하면, 같은 사진의 다른 영역 크기를 자동으로 추정하고 잘못 입력한 치수를 경고합니다.</p>
    {/if}
  </section>

  {#if lines.length}
    <section data-testid="object-price">
      <h3>예상 금액{#if size?.estimated}<span class="est">추정 {fmt(size.w)}×{fmt(size.h)} 기준</span>{/if}</h3>
      <table class="mini"><tbody>
        {#each lines as l, i (i)}
          <tr><td>{l.label.split(' · ')[1]}<small>{l.detail}</small></td><td>{won(l.amount)}</td></tr>
        {/each}
      </tbody></table>
    </section>
  {/if}

  <section class="chat-sec">
    <Chat objectId={obj.id} />
  </section>

  <footer>
    {#if !ro}<button class="btn small danger" onclick={() => { app.editBoundary(); app.project.removeObject(obj.id); app.editBoundary(); app.selectedId = null; }}>사인물 삭제</button>{/if}
  </footer>
</aside>

<style>
  .panel {
    position: absolute; top: 12px; right: 12px; bottom: 12px; width: 330px; z-index: 5;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  }
  header { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .title { flex: 1; background: none; border: 0; color: var(--text); font: inherit; font-size: 16px; font-weight: 700; padding: 4px; border-radius: 6px; }
  .title:focus { background: var(--input); outline: none; }
  section { padding: 10px 14px; border-bottom: 1px solid var(--line); }
  h3 { margin: 0 0 8px; font-size: 12px; color: var(--muted); font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .est { color: var(--warn); font-weight: 500; }
  .refs { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
  .refs .check { font-size: 12px; }
  .badge { background: var(--blue); color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 11px; }
  select { margin-top: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chips button {
    background: var(--input); border: 1px solid var(--line); color: var(--muted); border-radius: 14px;
    padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer;
  }
  .chips button.on { border-color: var(--accent); color: var(--accent); background: rgba(255, 204, 0, 0.08); }
  .warning { margin-top: 8px; background: rgba(255, 170, 0, 0.1); border: 1px solid rgba(255, 170, 0, 0.5); border-radius: 8px; padding: 8px 10px; font-size: 12px; }
  .warning b { color: var(--warn); }
  .warning p { margin: 4px 0 8px; }
  .mini { width: 100%; font-size: 12px; border-collapse: collapse; }
  .mini td { padding: 3px 0; vertical-align: top; }
  .mini td:last-child { text-align: right; white-space: nowrap; }
  .mini small { display: block; color: var(--muted); }
  .chat-sec { flex: 1; min-height: 220px; display: flex; flex-direction: column; padding: 0; }
  footer { padding: 8px 14px; }
</style>
