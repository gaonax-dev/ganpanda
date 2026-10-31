<!-- 사인물 세부 설정 창: 종류·시트·문구·치수·기준선·금액 상세·삭제 (패널의 [설정]) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { CATEGORY_GROUPS, SHEETS, sheetsForPicker, categoryOf, productsOf, signParts, isChannelProduct, CHANNEL_OPTIONS, thickPresetsFor, thicknessFieldOf } from '../core/catalog';
  import { addPrintItem, commitParts, partKindsFor, partsForProduct, partsOf } from '../core/parts';
  import { componentOf } from '../core/components';
  import FrontEditor from './FrontEditor.svelte';
  import SignProps from './SignProps.svelte';
  import LayerPanel from './LayerPanel.svelte';
  import { flatten, isItemLayer, layersOf, lockedItemIds } from '../core/layers';
  import type { PartItem } from '../core/model';
  import PartsEditor from './PartsEditor.svelte';
  import CrossSection from './CrossSection.svelte';
  import QuickSpec from './QuickSpec.svelte';
  import SpecInput from './SpecInput.svelte';
  import ColorField from './ColorField.svelte';
  import { charCountOf, quoteObject, won } from '../core/quote';
  import { normalizeOptions, optionGroupsFor, optionValue, type OptionField } from '../core/options';
  import { specFromObject } from '../core/letter3d';
  import type { SignObject } from '../core/model';

  let { obj }: { obj: SignObject } = $props();
  // 세부 설정 접기 (2026-10-31): 기본은 접힘 — 이 기기에 기억. 자동화(E2E)는 펼친 채로 시작해 예전 화면 그대로 시험한다
  const DETAIL_KEY = 'ganpanda.signDetail';
  const storedDetail = (() => { try { return localStorage.getItem(DETAIL_KEY); } catch { return null; } })();
  let detailOpen = $state(storedDetail ? storedDetail === 'open' : typeof navigator !== 'undefined' && navigator.webdriver);
  const setDetail = (open: boolean) => { detailOpen = open; try { localStorage.setItem(DETAIL_KEY, open ? 'open' : 'closed'); } catch { /* 기기 저장 불가 */ } };

  const category = $derived(categoryOf(obj));
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
  const close = () => { app.objectSettingsOpen = false; app.objectSettingsFocus = null; };
  /** 칩 = 탭 (2026-10-17 사용자: "칩을 일종의 탭으로"): body | part:<id> | layout | note | price. 칩에서 열렸으면 그 탭, 아니면 몸통(없으면 첫 구성 요소) */
  const parts = $derived(partsOf(obj));
  const hasBody = $derived(!!category && category !== 'sheet');
  /** 첫 화면 = 단면 쌓기 (재료 조합 S1, 2026-10-22 "단면쌓기는 인터페이스야") — 구성 요소를 붙일 수 있는 분류만, 아니면 전처럼 */
  const defaultTab = () => (category && partKindsFor(obj).length ? 'stack' : hasBody || !category ? 'body' : parts.length ? `part:${parts[0].id}` : 'note');
  const initial = app.objectSettingsFocus;
  // svelte-ignore state_referenced_locally
  let tab = $state<string>(initial === 'channel' || initial === 'led' ? (parts.find((p) => p.kind === 'channel') ? `part:${parts.find((p) => p.kind === 'channel')!.id}` : 'body') : initial === 'thick' ? 'body' : initial ?? defaultTab());
  const activePart = $derived(tab.startsWith('part:') ? parts.find((p) => p.id === tab.slice(5)) : undefined);
  // 탭의 구성 요소가 사라지면(지움) 몸통으로
  $effect(() => { if (tab.startsWith('part:') && !activePart) tab = defaultTab(); if (tab === 'layout' && !anyItemLayer) tab = defaultTab(); });
  /** 배치 탭(정면도)에서 객체를 고칠 때 */
  const setItemById = (partId: string, itemId: string, patch: Partial<PartItem>) => {
    const ps = JSON.parse(JSON.stringify(parts)) as typeof parts;
    const it = ps.find((p) => p.id === partId)?.items.find((x) => x.id === itemId);
    if (it) { Object.assign(it, patch); update(commitParts(obj, ps)); }
  };
  let layoutSel = $state<{ part: string; item: string } | null>(null);
  /** 레이어 트리 (3단계): 잠긴 객체는 정면도에서 못 끌고, 숨긴 객체가 있어도 배치 탭은 남는다 */
  const layerTree = $derived(layersOf(obj, parts));
  const lockedIds = $derived(lockedItemIds(layerTree));
  const anyItemLayer = $derived(flatten(layerTree).some((f) => isItemLayer(f.layer)));

  /** 조합형 (2026-10-16): 분류마다 붙일 수 있는 구성 요소(채널·스카시·시트)를 카드로 — 간판뿐 아니라 시트·스카시·포맥스·라이트패널·액자·어닝·사인미러도
      ("사인물 상세설정들을 모두 조합형으로 변경해주고 중복도 확인해줘") */
  const partKinds = $derived(partKindsFor(obj));
  const composable = $derived(partKinds.length > 0);
  const thickPresets = $derived(thickPresetsFor(obj.productId));
  /** 두께는 치수가 아니라 소재(종류)에 — 받는 종류만 (thicknessFieldOf) */
  const thick = $derived(thicknessFieldOf(obj.productId));
  const LETTER_KEYS = new Set(['channel', 'chType', 'chBuild', 'chDepth', 'chDouble', 'chFinish', 'chBack', 'chStep', 'chStandoff', 'chGalvaFace', 'chBulbPitch', 'ledColor', 'font', 'chSideMat', 'bodySystem', 'bodyCode', 'bodyGloss', 'chFace', 'chHeight', 'chFrame', 'chFrameColor', 'bracket', 'scashi', 'scThick', 'scMaterial', 'scPaintSystem', 'scPaintCode', 'scPaintGloss', 'scHeight']);
  const optionGroups = $derived(optionGroupsFor(obj).map((g) => (composable ? { ...g, fields: g.fields.filter((f) => !LETTER_KEYS.has(f.key)) } : g)).filter((g) => g.fields.length && !(composable && g.title === '시트 옵션')));
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
  <div class="dialog" class:ro data-ro={ro || undefined} role="dialog" aria-modal="true" aria-label="사인물 설정" data-testid="object-settings">
    <header><h2>{obj.name} 설정</h2><button class="icon" data-testid="close-object-settings" title="닫기" onclick={close}>✕</button></header>
    <div class="body">
      <!-- 간판 속성 (2026-10-31 "현재 사인물 설정이 많이 복잡해 …"): 3D 뷰어 · 배치 · 단 · 요소 클로즈업 — 지금까지의 설정은 아래 "세부 설정"에 접어 둔다 -->
      <SignProps {obj}>
        {#snippet layout()}<FrontEditor {obj} {parts} {ro} bind:sel={layoutSel} setItem={setItemById} locked={lockedIds} />{/snippet}
      </SignProps>
      <details class="detail" data-testid="sign-detail" open={detailOpen} ontoggle={(e) => setDetail((e.currentTarget as HTMLDetailsElement).open)}>
      <summary data-testid="sign-detail-toggle">세부 설정 <span class="hint">치수·단면·옵션·시트·문구·견적</span></summary>
      <section data-testid="size-section"> <!-- 사인물 전체 치수는 맨 위 (2026-10-16 사용자: "치수가 가장 아래있어. 사인물 전체 치수는 최상단에") -->
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
          {#if isChannel && !composable}
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
      <!-- 사양 글 + 칩(탭): 치수 바로 아래 (2026-10-17 사용자: "사이즈 아래에 갈바 흰색 / 체널 갈색 / 후광4000k", "칩을 일종의 탭으로") -->
      {#if category}<section data-testid="quick-section" class="tabs">{#if !ro}<SpecInput {obj} {ro} {update} />{/if}<QuickSpec {obj} {ro} {update} active={tab} onPick={(t) => (tab = t)} /></section>{/if}
      {#if tab === 'stack'}
        <section><h3>단면 쌓기 <span class="hint">무엇 위에 올렸는가 = 층. 층을 눌러 속성을 고치고, 정면도에서 자리를 잡습니다</span></h3>
          <CrossSection {obj} {ro} {update} {hasBody} kinds={partKinds} onTab={(t) => (tab = t)} /></section>
      {:else if tab === 'body'}
      <section>
        <h3>종류 <span class="cat">{category ? CATEGORY_GROUPS.find((g) => g.id === category)?.label : '분류 없음 (패널에서 선택)'}</span></h3>
        {#if category && category !== 'sheet'}
          <!-- 간판 종류 = 몸통. 채널은 아래 사양의 옵션 (2026-10-15). 옛 채널 제품은 몸통 없음으로 보인다 -->
          <select data-testid="product-select" value={bodyId} disabled={ro} onchange={(e) => update({ productId: e.currentTarget.value, parts: partsForProduct(obj, e.currentTarget.value), ...(isChannelProduct(obj.productId) ? { options: { ...(obj.options ?? {}), channel: CHANNEL_OPTIONS.find((c) => c.id === obj.productId)?.label ?? '없음' } } : {}) })}>
            {#each productsOf(category) as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        {/if}
        {#if (bodyId === 'board-flex' || bodyId === 'board-reface') && !ro}
          <!-- 미리보기 글자·그림 (2026-10-21 "uv후렉스출력에 배경색 글자 그림 옵션" → "미리보기로 하고 디자인은 별도로"): 배경색은 아래 미리보기 묶음, 글자·그림은 미리보기 구성 요소 — 실제 원고는 디자인 파일 -->
          <div class="row" data-testid="print-items">
            <span class="hint">미리보기</span>
            <button class="btn small" data-testid="add-print-text" onclick={() => { const r = addPrintItem(obj, 'text'); update(r.patch); tab = `part:${r.partId}`; }}>+ 글자</button>
            <button class="btn small" data-testid="add-print-image" onclick={() => { const r = addPrintItem(obj, 'image'); update(r.patch); tab = `part:${r.partId}`; }}>+ 그림</button>
          </div>
        {/if}
        {#if thick}
          <!-- 두께는 소재에 (2026-10-16 사용자: "사인물 가로세로만 표시하고 두께는 소재에 붙이는게 맞을 거 같은데"). 판재는 빠른 선택 3~30T -->
          <div class="thickrow" data-testid="thickness">
            <label>{thick.label}
              <input data-testid="depth-mm" type="number" min="0" step={thick.unit === 'T' ? 1 : 10} value={obj.depthMm ?? ''} disabled={ro}
                placeholder={obj.options?.thick ? `${obj.options.thick} (예전 값)` : thick.unit === 'T' ? '예: 5' : '프레임·돌출 깊이'}
                oninput={(e) => update({ depthMm: num(e.currentTarget.value) })} />
              <small>{thick.unit === 'T' ? 'T (mm)' : 'mm'}</small>
            </label>
            {#if thickPresets.length && !ro}
              <div class="chips thick" data-testid="thick-presets">
                {#each thickPresets as t (t)}<button data-testid="thick-{t}" class:on={obj.depthMm === t} onclick={() => update({ depthMm: t })}>{t}T</button>{/each}
              </div>
            {/if}
          </div>
        {/if}
      </section>

      {#if obj.shape !== 'polygon'}
        <section>
          <h3>모양 <span class="cat">{obj.shape === 'ellipse' ? '원 (타원)' : !obj.corner ? '사각' : obj.corner >= 0.5 ? '원·알약' : `둥근 사각 ${Math.round(obj.corner * 100)}%`}</span></h3>
          <label class="slider">모서리 둥글기
            <input data-testid="corner-ratio" type="range" min="0" max="50" step="1" value={obj.shape === 'ellipse' ? 50 : Math.round((obj.corner ?? 0) * 100)} disabled={ro}
              oninput={(e) => update({ shape: 'rect', corner: Number(e.currentTarget.value) / 100 || undefined })} />
          </label>
          <p class="hint">0 = 사각형, 50 = 원·알약. 사각형이 기본이라 디자인(UV)이 그대로 입혀지고 모서리만 깎입니다.</p>
        </section>
      {/if}

      {#each optionGroups as g (g.title)}
        <section data-testid="option-group" data-preview={g.preview ? 'true' : undefined}>
          <h3>{g.title}</h3>
          {#if g.preview}<p class="hint" data-testid="preview-hint">디자이너 참고용 — 요약·주문서 사양에는 안 들어갑니다. 실제 원고는 디자인 파일.</p>{/if}
          <div class="opts">
            {#each g.fields as f (f.key + (f.paint?.part ?? ''))}
              {@const v = optionValue(f, obj.options ?? {})}
              {#if f.paint?.part === 'system'}
                <!-- 도색 객체 = 컬러 피커 (간단 견본 / 확장 체계·코드·광택), 코드·광택 필드는 그 안에서 -->
                <ColorField prefix={f.paint.prefix} label={f.paint.label} opts={obj.options ?? {}} {ro} set={(k, val) => setOption({ key: k, label: k, kind: 'text' }, val)} />
              {:else if f.paint}
                <!-- 컬러 피커가 그린다 -->
              {:else if f.kind === 'select'}
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

      {#if !composable}
      {#if obj.sheetIds.length}
      <section>
        <h3>시트</h3>
        <div class="chips">
          <!-- 고르는 시트는 UV 실사·단색·재질·안개 (2026-10-15). 옛 시트(원웨이·반사·투명)는 이미 붙어 있을 때만 -->
          {#each SHEETS.filter((s) => sheetsForPicker().includes(s) || obj.sheetIds.includes(s.id)) as s (s.id)}
            <button data-testid="sheet-{s.id}" class:on={obj.sheetIds.includes(s.id)} disabled={ro} onclick={() => toggleSheet(s.id)}>{s.name}</button>
          {/each}
        </div>
      </section>
      {/if}

      <section>
        <h3>문구</h3>
        <input data-testid="sign-text" value={obj.text ?? ''} placeholder="간판에 들어갈 글자 (예: 간판다 카페)" disabled={ro}
          oninput={(e) => update({ text: e.currentTarget.value })} />
      </section>
      {/if}
      {:else if activePart}
        <!-- 구성 요소 탭: 그 카드 하나 -->
        <section><h3>{componentOf(activePart.kind).label} <span class="hint">글자·그림 위치는 [배치] 탭의 정면도에서도</span></h3>
          <PartsEditor {obj} {ro} {update} kinds={partKinds} partId={activePart.id} /></section>
      {:else if tab === 'layout'}
        <section><h3>배치 <span class="hint">글자·그림·도형을 간판 면 위에서 끌어 놓기 — 3D·실사·전개도에 그대로. 레이어 패널에서 순서·보이기·잠금·그룹 (2026-10-18)</span></h3>
          <FrontEditor {obj} {parts} {ro} bind:sel={layoutSel} setItem={setItemById} locked={lockedIds} />
          <LayerPanel {obj} {ro} {update} bind:sel={layoutSel} /></section>
      {/if}

      {#if tab === 'note' || (tab !== 'price' && !category)}
      <section>
        <h3>요청사항</h3>
        <textarea data-testid="sign-note" rows="3" value={obj.note ?? ''} placeholder="이 사인물의 배선 위치, 특수 가공, 현장 조건 등" disabled={ro} oninput={(e) => update({ note: e.currentTarget.value || undefined })}></textarea>
      </section>
      {/if}

      {#if lines.length && !app.isCustomer && (tab === 'price' || !category)}
        <section data-testid="object-price">
          <h3>예상 금액{#if size?.estimated}<span class="est">추정 {fmt(size.w)}×{fmt(size.h)} 기준</span>{/if}</h3>
          <table class="mini"><tbody>
            {#each lines as l, i (i)}
              <tr><td>{l.label.split(' · ')[1]}<small>{l.detail}</small></td><td>{won(l.amount)}</td></tr>
            {/each}
          </tbody></table>
        </section>
      {/if}
      </details>
    </div>
    <footer>
      {#if can3d}<button class="btn small" data-testid="open-letter3d" onclick={() => (app.letter3dOpen = true)}>입체 보기 (3D)</button>{/if}
      {#if !ro}<button class="btn small" data-testid="duplicate-sign" title="바로 옆에 같은 사인물 하나 더 (⌘/Ctrl+D)" onclick={() => { close(); app.selectObject(obj.id); app.duplicateSelected(); }}>복제</button><button class="btn small danger" data-testid="delSign" onclick={remove}>사인물 삭제</button>{/if}
      <span class="sp"></span>
      <button class="btn small" onclick={close}>닫기</button>
    </footer>
  </div>
</div>

<style>
  .detail > summary { cursor: pointer; padding: 8px 0; font-weight: 700; }
  .detail { border-top: 1px solid var(--line); margin-top: 8px; }
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 64px); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
  header { display: flex; align-items: center; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  h2 { flex: 1; margin: 0; font-size: 16px; }
  .body { overflow: auto; min-height: 0; }
  /* 휴대폰: 거의 전체 화면, 아래 단추(복제·삭제·닫기)가 항상 보이게 (2026-10-17) */
  @media (max-width: 720px) { .dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); } }
  /* 휴대폰 세로 보기: 상세 창은 전체 화면 (2026-10-17 사용자: "모바일(세로보기)에서는 상세보기는 전창으로") */
  @media (max-width: 720px) and (orientation: portrait) { .backdrop { place-items: stretch; } .dialog { width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; border: 0; box-sizing: border-box; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); } [data-testid='close-object-settings'] { min-width: 40px; min-height: 40px; font-size: 18px; } } /* 아이폰 노치·상태 표시줄 아래로 (2026-10-27 "원근세부창 아이폰에서 x마크 휴대폰상단 표시로 가서 잘 안잡힘") */
  section { padding: 10px 16px; border-bottom: 1px solid var(--line); }
  h3 { margin: 0 0 8px; font-size: 12px; color: var(--muted); font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .est { color: var(--warn); font-weight: 500; }
  .cat { color: var(--text); font-weight: 700; }
  .tabs { display: flex; flex-direction: column; gap: 8px; background: rgba(255, 255, 255, 0.02); }
  h3 .hint { font-weight: 400; color: var(--muted); }
  .opts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  /* 옵션은 가로 한 줄: 라벨 왼쪽, 컨트롤 오른쪽 (2026-10-18 "세로 배치가 자리를 많이 차지하고 헷갈려") */
  .opt { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); min-width: 0; }
  .opt > select, .opt > input { flex: 1 1 50%; min-width: 0; max-width: 62%; margin-top: 0; }
  .check { font-size: 12px; display: flex; align-items: center; gap: 6px; grid-column: 1 / -1; }
  textarea { width: 100%; box-sizing: border-box; }
  .slider { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
  .slider input { flex: 1; min-width: 0; }
  .badge { background: var(--blue); color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 11px; }
  select { margin-top: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .thickrow { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .thickrow label { display: flex; flex-direction: row; align-items: center; gap: 6px; }
  .thickrow input { width: 100px; }
  .chips button {
    background: var(--input); border: 1px solid var(--line); color: var(--muted); border-radius: 14px;
    padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer;
  }
  .chips button.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
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
