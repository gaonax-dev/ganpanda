<!-- 사인물 세부 설정 창: 종류·시트·문구·치수·기준선·금액 상세·삭제 (패널의 [설정]) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { CATEGORY_GROUPS, SHEETS, sheetsForPicker, categoryOf, productById, productsOf, signParts, isChannelProduct, CHANNEL_OPTIONS } from '../core/catalog';
  import { charCountOf, quoteObject, won } from '../core/quote';
  import { normalizeOptions, optionGroupsFor, optionValue, type OptionField } from '../core/options';
  import { specFromObject } from '../core/letter3d';
  import type { SignObject } from '../core/model';

  let { obj }: { obj: SignObject } = $props();

  const category = $derived(categoryOf(obj));
  const product = $derived(productById(obj.productId));
  const m = $derived(app.measures.get(obj.id));
  // 입력 치수가 없으면 판독 추정 치수로 계산 (리스트 견적과 동일 규칙)
  const size = $derived(app.sizeOf(obj));
  const lines = $derived(quoteObject(size ? { ...obj, widthMm: size.w, heightMm: size.h } : obj, app.prices));
  const autoChars = $derived(charCountOf({ text: obj.text }));
  /** 채널(입체 글자)이 있는가: 채널 옵션 또는 옛 채널 제품 */
  const isChannel = $derived(!!signParts(obj).channelId);
  const can3d = $derived(isChannel && !!specFromObject(obj));
  const bodyId = $derived(signParts(obj).bodyId);
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

  const ro = $derived(!app.canEdit);
  const update = (patch: Partial<SignObject>) => { if (app.canEdit) app.project.updateObject(obj.id, patch); };
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)));
  const close = () => (app.objectSettingsOpen = false);

  const optionGroups = $derived(optionGroupsFor(obj));
  function setOption(f: OptionField, v: string | boolean) {
    const next = { ...normalizeOptions(obj), [f.key]: v };
    update({ options: normalizeOptions({ ...obj, options: next }) });
  }
  function toggleSheet(id: string) {
    const has = obj.sheetIds.includes(id);
    update({ sheetIds: has ? obj.sheetIds.filter((s) => s !== id) : [...obj.sheetIds, id] });
  }
  function remove() {
    app.editBoundary(); app.project.removeObject(obj.id); app.editBoundary();
    close(); app.selectedId = null;
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }} />

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="사인물 설정" data-testid="object-settings">
    <header><h2>{obj.name} 설정</h2><button class="icon" data-testid="close-object-settings" title="닫기" onclick={close}>✕</button></header>
    <div class="body">
      <section>
        <h3>종류 <span class="cat">{category ? CATEGORY_GROUPS.find((g) => g.id === category)?.label : '분류 없음 (패널에서 선택)'}</span></h3>
        {#if category && category !== 'sheet'}
          <!-- 간판 종류 = 몸통. 채널은 아래 사양의 옵션 (2026-10-15). 옛 채널 제품은 몸통 없음으로 보인다 -->
          <select data-testid="product-select" value={bodyId} disabled={ro} onchange={(e) => update({ productId: e.currentTarget.value, ...(isChannelProduct(obj.productId) ? { options: { ...(obj.options ?? {}), channel: CHANNEL_OPTIONS.find((c) => c.id === obj.productId)?.label ?? '없음' } } : {}) })}>
            {#each productsOf(category) as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        {/if}
        {#if can3d}
          <button class="btn small" data-testid="open-letter3d" onclick={() => (app.letter3dOpen = true)}>입체 보기 (3D)</button>
        {/if}
      </section>

      {#if obj.shape !== 'polygon'}
        <section>
          <h3>모양 <span class="cat">{obj.shape === 'ellipse' ? '타원 (옛 형식)' : !obj.corner ? '사각' : obj.corner >= 0.5 ? '원·알약' : `둥근 사각 ${Math.round(obj.corner * 100)}%`}</span></h3>
          <label class="slider">모서리 둥글기
            <input data-testid="corner-ratio" type="range" min="0" max="50" step="1" value={obj.shape === 'ellipse' ? 50 : Math.round((obj.corner ?? 0) * 100)} disabled={ro}
              oninput={(e) => update({ shape: 'rect', corner: Number(e.currentTarget.value) / 100 || undefined })} />
          </label>
          <p class="hint">0 = 사각형, 50 = 원·알약. 사각형이 기본이라 디자인(UV)이 그대로 입혀지고 모서리만 깎입니다.</p>
        </section>
      {/if}

      {#each optionGroups as g (g.title)}
        <section data-testid="option-group">
          <h3>{g.title}</h3>
          <div class="opts">
            {#each g.fields as f (f.key)}
              {@const v = optionValue(f, obj.options ?? {})}
              {#if f.kind === 'select'}
                <label class="opt">{f.label}
                  <select data-testid="option-{f.key}" value={v} disabled={ro} onchange={(e) => setOption(f, e.currentTarget.value)}>
                    {#each f.values ?? [] as o2 (o2.id)}<option value={o2.id}>{o2.label}</option>{/each}
                  </select>
                </label>
              {:else if f.kind === 'toggle'}
                <label class="check"><input type="checkbox" data-testid="option-{f.key}" checked={v === true} disabled={ro} onchange={(e) => setOption(f, e.currentTarget.checked)} /> {f.label}</label>
              {:else}
                <label class="opt">{f.label}
                  <input data-testid="option-{f.key}" value={String(v)} placeholder={f.placeholder} disabled={ro} oninput={(e) => setOption(f, e.currentTarget.value)} />
                </label>
              {/if}
            {/each}
          </div>
        </section>
      {/each}

      <section>
        <h3>시트</h3>
        <div class="chips">
          <!-- 고르는 시트는 UV 실사·단색·재질·안개 (2026-10-15). 옛 시트(원웨이·반사·투명)는 이미 붙어 있을 때만 -->
          {#each SHEETS.filter((s) => sheetsForPicker().includes(s) || obj.sheetIds.includes(s.id)) as s (s.id)}
            <button data-testid="sheet-{s.id}" class:on={obj.sheetIds.includes(s.id)} disabled={ro} onclick={() => toggleSheet(s.id)}>{s.name}</button>
          {/each}
        </div>
      </section>

      <section>
        <h3>문구</h3>
        <input data-testid="sign-text" value={obj.text ?? ''} placeholder="간판에 들어갈 글자 (예: 간판다 카페)" disabled={ro}
          oninput={(e) => update({ text: e.currentTarget.value })} />
      </section>

      <section>
        <h3>
          치수 (mm)
          {#if m?.reference}<span class="badge" data-testid="reference-badge" title="이 사진의 다른 영역은 이 치수를 기준으로 추정합니다">기준 영역</span>{/if}
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
          {#if product && bodyId !== 'body-none'}
            <label>두께
              <input data-testid="depth-mm" type="number" min="0" step="10" value={obj.depthMm ?? ''} disabled={ro} placeholder="보드 두께·돌출 깊이"
                oninput={(e) => update({ depthMm: num(e.currentTarget.value) })} />
            </label>
          {/if}
          {#if isChannel}
            <label>글자수
              <input data-testid="char-count" type="number" min="0" value={obj.charCount ?? ''} disabled={ro}
                placeholder={autoChars ? `자동 ${autoChars}` : '문구 입력'} oninput={(e) => update({ charCount: num(e.currentTarget.value) })} />
            </label>
          {/if}
        </div>
        {#each (app.warnMeasure ? m?.warnings ?? [] : []) as w, i (i)}
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

      <section>
        <h3>요청사항</h3>
        <textarea data-testid="sign-note" rows="2" value={obj.note ?? ''} placeholder="이 사인물의 배선 위치, 특수 가공, 현장 조건 등" disabled={ro} oninput={(e) => update({ note: e.currentTarget.value || undefined })}></textarea>
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
    </div>
    <footer>
      {#if !ro}<button class="btn small" data-testid="duplicate-sign" title="바로 옆에 같은 사인물 하나 더 (⌘/Ctrl+D)" onclick={() => { close(); app.selectObject(obj.id); app.duplicateSelected(); }}>복제</button><button class="btn small danger" data-testid="delSign" onclick={remove}>사인물 삭제</button>{/if}
      <span class="sp"></span>
      <button class="btn small" onclick={close}>닫기</button>
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  h2 { flex: 1; margin: 0; font-size: 16px; }
  .body { overflow: auto; }
  section { padding: 10px 16px; border-bottom: 1px solid var(--line); }
  h3 { margin: 0 0 8px; font-size: 12px; color: var(--muted); font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .est { color: var(--warn); font-weight: 500; }
  .cat { color: var(--text); font-weight: 700; }
  .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .opt { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); }
  .check { font-size: 12px; display: flex; align-items: center; gap: 6px; grid-column: 1 / -1; }
  textarea { width: 100%; box-sizing: border-box; }
  .slider { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .slider input { width: 100%; }
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
  footer { display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--line); }
  .sp { flex: 1; }
</style>
