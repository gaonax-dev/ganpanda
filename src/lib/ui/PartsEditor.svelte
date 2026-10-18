<!--
  조합형 사인물 구성 요소 편집 (2026-10-16 사용자: "조합형으로 구성할 수 있을까 사인물 간판프레임+체널,스카시,시트 / 간판프레임 아래에 선택가능한 리스트를 넣어주면 해당 객체를 사용한다 /
  채널 객체에 포함된 글자 입력객체를 간판 중앙에 배치하고 크기와 위치지정 가능하게 / 스카시… 글자 입력객체 사용 그림입력객체도 있음 / 체널도 추가 할수 있는 시트를 올려 커팅시트, uv출력 시트…",
  답 "뭐든 붙일 수 있다", "그림: 디자인 파일·직접 올린 그림 둘다").
  간판 프레임 아래 [+ 채널] [+ 스카시] [+ 커팅 시트] [+ UV 출력 시트]. 카드마다 세부 종류·옵션·내용 객체(글자·그림, 간판 중앙 기준 mm).
  옛 사인물(채널 옵션·문구·시트)은 구성 요소로 보이고, 처음 고칠 때 구성 요소로 저장한다(옛 필드는 정리).
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { putAsset } from '../assets';
  import type { PartItem, SignObject, SignPart } from '../core/model';
  import { PART_KIND_LABEL, commitParts, newItem, newPart, partLabel, partSpecOf, partsOf, sheetTargets } from '../core/parts';
  import { componentOf } from '../core/components';
  import { optionValue, partOptionFields, type OptionField } from '../core/options';
  import { charCountOf } from '../core/quote';
  import FrontEditor from './FrontEditor.svelte';
  import ColorField from './ColorField.svelte';

  /** kinds = 이 분류에 붙일 수 있는 구성 요소 (partKindsFor) */
  /** partId 가 있으면 그 구성 요소 카드 하나만 (설정 창의 탭, 2026-10-17 "칩을 일종의 탭으로") — 추가 단추·정면도는 바깥(칩 [+]·배치 탭)에 */
  let { obj, ro, update, kinds = ['channel', 'scashi', 'sheet'], partId }: { obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void; kinds?: SignPart['kind'][]; partId?: string } = $props();

  const parts = $derived(partsOf(obj));
  const clone = (): SignPart[] => JSON.parse(JSON.stringify(parts));
  const commit = (next: SignPart[]) => update(commitParts(obj, next));
  const edit = (fn: (ps: SignPart[]) => void) => { const ps = clone(); fn(ps); commit(ps); };
  const addPart = (kind: SignPart['kind'], type?: string) => edit((ps) => ps.push(newPart(kind, type)));
  const setPart = (i: number, patch: Partial<SignPart>) => edit((ps) => Object.assign(ps[i], patch));
  const setPartOption = (i: number, f: OptionField, v: string | boolean) => edit((ps) => { ps[i].options = { ...(ps[i].options ?? {}), [f.key]: v }; });
  const delPart = (i: number) => edit((ps) => {
    const gone = ps[i].id;
    ps.splice(i, 1);
    for (const p of ps) if (p.on === gone) p.on = 'frame'; // 지운 채널·시트 위의 시트는 프레임 면으로
  });
  const addItem = (i: number, kind: PartItem['kind']) => edit((ps) => { const it = newItem(kind); if (kind === 'shape') it.fill = componentOf(ps[i].kind).color; ps[i].items.push(it); }); // 도형은 종류 색으로 채워 시작 (2단계)
  const setItem = (i: number, j: number, patch: Partial<PartItem>) => edit((ps) => Object.assign(ps[i].items[j], patch));
  const delItem = (i: number, j: number) => edit((ps) => ps[i].items.splice(j, 1));
  /** 정면도에서 고칠 때 (구성 요소·객체 id 로) */
  const setItemById = (partId: string, itemId: string, patch: Partial<PartItem>) => edit((ps) => {
    const it = ps.find((p) => p.id === partId)?.items.find((x) => x.id === itemId);
    if (it) Object.assign(it, patch);
  });
  /** 정면도와 카드가 함께 쓰는 선택 */
  let sel = $state<{ part: string; item: string } | null>(null);
  const hasItems = $derived(parts.some((p) => p.items.length));
  const num = (v: string): number => (v.trim() === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

  /** 디자인 파일 페이지 → 그림 소스 */
  const pageChoices = $derived(app.sources.flatMap((s) => s.pages.map((_, k) => ({ value: `src:${s.id}:${k}`, label: `${s.name}${s.pages.length > 1 ? ` p${k + 1}` : ''}` }))));
  const sourceValue = (it: PartItem) => (it.image && 'sourceId' in it.image ? `src:${it.image.sourceId}:${it.image.page}` : '');
  function pickSource(i: number, j: number, v: string) {
    if (!v) { setItem(i, j, { image: undefined }); return; }
    const [, sourceId, page] = v.split(':');
    setItem(i, j, { image: { sourceId, page: Number(page) } });
  }
  async function uploadImage(i: number, j: number, file: File | undefined) {
    if (!file) return;
    const assetId = await putAsset(file);
    setItem(i, j, { image: { assetId, name: file.name } });
  }
</script>

<section data-testid="parts-section" class:single={!!partId}>
  {#if !partId}<h3>구성 요소 <span class="hint">이 사인물에 붙는 {kinds.map((k) => PART_KIND_LABEL[k]).join('·')}와 그 글자·그림 (위치는 사인물 중앙 기준 mm, 위 +)</span></h3>{/if}
  {#if !ro && !partId}
    <div class="adds">
      {#if kinds.includes('channel')}<button class="btn small" data-testid="add-part-channel" onclick={() => addPart('channel')}>+ 채널</button>{/if}
      {#if kinds.includes('scashi')}<button class="btn small" data-testid="add-part-scashi" onclick={() => addPart('scashi')}>+ 스카시</button>{/if}
      {#if kinds.includes('sheet')}
        <!-- 시트 = UV 출력 / 재질 시트, 커팅(돔보컷팅·커팅, 완컷·반컷, 보조시트)은 카드의 옵션 (2026-10-16) -->
        <button class="btn small" data-testid="add-part-sheet-uv" onclick={() => addPart('sheet', 'sh-print')}>+ UV 출력</button>
        <button class="btn small" data-testid="add-part-sheet-cut" onclick={() => addPart('sheet', 'sh-cut')}>+ 재질 시트</button>
      {/if}
    </div>
  {/if}
  {#if hasItems && !partId}<FrontEditor {obj} {parts} {ro} bind:sel setItem={setItemById} />{/if}
  {#each parts as p, i (p.id)}
    {#if !partId || p.id === partId}
    {@const comp = componentOf(p.kind)}
    <div class="card" data-testid="part-card">
      <div class="head" data-kind={p.kind}>
        <b>{comp.label}</b>{#if comp.hasSpec}<span class="spec" data-testid="part-spec">{partSpecOf(p)}</span>{/if}
        <select data-testid="part-type" value={p.type} disabled={ro} onchange={(e) => setPart(i, { type: e.currentTarget.value, options: {} })}>
          {#each comp.types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
          {#if !comp.types.some((t) => t.id === p.type)}<option value={p.type}>{partLabel(p)}</option>{/if}
        </select>
        {#if comp.sits}
          <label class="on">올릴 곳
            <!-- 프레임 면 · 채널 앞면 · 다른 시트 위 (2026-10-17 "안개커팅 위에 로고 돔보컷팅") -->
            <select data-testid="part-on" value={p.on ?? 'frame'} disabled={ro} onchange={(e) => setPart(i, { on: e.currentTarget.value })}>
              {#each sheetTargets(parts, p) as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
            </select>
          </label>
        {/if}
        {#if !ro}<button class="icon del" data-testid="part-delete" title="구성 요소 지우기" onclick={() => delPart(i)}>✕</button>{/if}
      </div>
      <div class="opts">
        {#each partOptionFields(p) as f (f.key + (f.paint?.part ?? ''))}
          {@const v = optionValue(f, p.options ?? {})}
          {#if f.paint?.part === 'system'}
            <ColorField prefix={f.paint.prefix} label={f.paint.label} opts={p.options ?? {}} {ro} tp="part-option-" set={(k, val) => setPartOption(i, { key: k, label: k, kind: 'text' }, val)} />
          {:else if f.paint}
            <!-- 컬러 피커가 그린다 -->
          {:else if f.kind === 'select'}
            <label class="opt">{f.label}
              <select data-testid="part-option-{f.key}" value={v} disabled={ro} onchange={(e) => setPartOption(i, f, e.currentTarget.value)}>
                {#each f.values ?? [] as o2 (o2.id)}<option value={o2.id}>{o2.label}</option>{/each}
              </select>
            </label>
          {:else if f.kind === 'toggle'}
            <label class="check"><input type="checkbox" data-testid="part-option-{f.key}" checked={v === true} disabled={ro} onchange={(e) => setPartOption(i, f, e.currentTarget.checked)} /> {f.label}</label>
          {:else}
            <label class="opt">{f.label}<input data-testid="part-option-{f.key}" value={String(v)} placeholder={f.placeholder} disabled={ro} onchange={(e) => setPartOption(i, f, e.currentTarget.value)} /></label>
          {/if}
        {/each}
      </div>
      <div class="items">
        {#each p.items as it, j (it.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="item" class:sel={sel?.part === p.id && sel?.item === it.id} data-testid="part-item" data-kind={it.kind} onclick={() => (sel = { part: p.id, item: it.id })}>
            {#if it.kind === 'text'}
              <input class="txt" data-testid="item-text" value={it.text ?? ''} placeholder="글자" disabled={ro} oninput={(e) => setItem(i, j, { text: e.currentTarget.value })} />
              <label title="비우면 글자에서 셉니다 (공백 제외)">글자수<input type="number" data-testid="item-count" value={it.count ?? ''} placeholder={String(charCountOf({ text: it.text }))} disabled={ro} oninput={(e) => setItem(i, j, { count: num(e.currentTarget.value) || undefined })} /></label>
            {:else if it.kind === 'shape'}
              <!-- 도형 (2단계): 사각·원·선 + 채움·선 색 -->
              <select data-testid="item-shape" value={it.shape ?? 'rect'} disabled={ro} onchange={(e) => setItem(i, j, { shape: e.currentTarget.value as PartItem['shape'] })}>
                <option value="rect">사각</option><option value="ellipse">원</option><option value="line">선</option>
              </select>
              <label title="채움 색">채움<input type="color" data-testid="item-fill" value={it.fill ?? '#ffffff'} disabled={ro} oninput={(e) => setItem(i, j, { fill: e.currentTarget.value })} /><input type="checkbox" title="채움 없음" checked={!it.fill} disabled={ro} onchange={(e) => setItem(i, j, { fill: e.currentTarget.checked ? undefined : componentOf(p.kind).color })} /></label>
              <label title="선 색">선<input type="color" data-testid="item-stroke" value={it.stroke ?? '#000000'} disabled={ro} oninput={(e) => setItem(i, j, { stroke: e.currentTarget.value })} /><input type="checkbox" title="선 없음" checked={!it.stroke} disabled={ro} onchange={(e) => setItem(i, j, { stroke: e.currentTarget.checked ? undefined : '#000000' })} /></label>
            {:else}
              <select data-testid="item-image-source" value={sourceValue(it)} disabled={ro} onchange={(e) => pickSource(i, j, e.currentTarget.value)}>
                <option value="">디자인 파일에서…</option>
                {#each pageChoices as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
              </select>
              <label class="file">그림 올리기<input type="file" accept="image/*" data-testid="item-image-file" disabled={ro} onchange={(e) => uploadImage(i, j, e.currentTarget.files?.[0])} /></label>
              {#if it.image && 'assetId' in it.image}<span class="fname" data-testid="item-image-name">{it.image.name ?? '그림'}</span>{/if}
            {/if}
            <label>높이<input type="number" data-testid="item-h" value={it.h} disabled={ro} oninput={(e) => setItem(i, j, { h: num(e.currentTarget.value) })} /></label>
            {#if it.kind !== 'text' || componentOf(p.kind).itemWidth}<label>가로<input type="number" data-testid="item-w" value={it.w ?? ''} disabled={ro} oninput={(e) => setItem(i, j, { w: num(e.currentTarget.value) || undefined })} /></label>{/if}
            <label>X<input type="number" data-testid="item-x" value={it.x} disabled={ro} oninput={(e) => setItem(i, j, { x: num(e.currentTarget.value) })} /></label>
            <label>Y<input type="number" data-testid="item-y" value={it.y} disabled={ro} oninput={(e) => setItem(i, j, { y: num(e.currentTarget.value) })} /></label>
            {#if !ro}<button class="icon del" data-testid="item-delete" title="지우기" onclick={() => delItem(i, j)}>✕</button>{/if}
          </div>
        {/each}
        {#if !ro}
          <div class="adds">
            <button class="btn small" data-testid="add-item-text" onclick={() => addItem(i, 'text')}>+ 글자</button>
            <button class="btn small" data-testid="add-item-image" onclick={() => addItem(i, 'image')}>+ 그림</button>
            <button class="btn small" data-testid="add-item-shape" onclick={() => addItem(i, 'shape')}>+ 도형</button>
          </div>
        {/if}
      </div>
    </div>
    {/if}
  {/each}
</section>

<style>
  .single { padding: 0; }
  .single .card { margin: 0; border: 0; padding: 0; }
  .hint { font-weight: 400; font-size: 11px; color: var(--muted, #8b93a3); margin-left: 6px; }
  .adds { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .card { border: 1px solid var(--border, #2a2f37); border-radius: 8px; padding: 8px; margin: 8px 0; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .head .del { margin-left: auto; }
  .opts { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 6px 0; }
  .opt { display: flex; flex-direction: row; align-items: center; font-size: 12px; gap: 6px; } /* 가로 한 줄 (2026-10-18) */
  .opt > select, .opt > input { min-width: 0; }
  .check { font-size: 12px; display: flex; align-items: center; gap: 4px; }
  .item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 0; border-top: 1px dashed var(--border, #2a2f37); }
  .item.sel { background: rgba(90, 168, 255, 0.08); }
  .item label { display: flex; align-items: center; gap: 3px; font-size: 12px; }
  .item input[type='number'] { width: 70px; }
  .item input[type='color'] { width: 28px; height: 22px; padding: 0; border: 0; background: none; }
  .item input[type='checkbox'] { width: auto; }
  .item .txt { flex: 1; min-width: 120px; }
  .file input { width: 160px; }
  .fname { font-size: 12px; opacity: 0.8; }
  .spec { font-size: 11px; color: var(--muted, #8b93a3); }
  .on { font-size: 12px; display: flex; align-items: center; gap: 4px; }
</style>
