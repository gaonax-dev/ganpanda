<!--
  칩 = 탭 (2026-10-17 사용자: "난 칩을 일종의 탭으로 작동하게 하고 싶다. 현재 상세에 구성된 내용을 칩을 클릭하고 보여지게하고 입력한 문자를 사용해 상세 내역을 자동으로 구성").
  칩: [몸통 종류·색] [구성 요소마다 하나: 채널 후광 ●갈색 4000K / 스카시 … / 시트 …] [배치] [메모] [금액] 그리고 끝에 [+](구성 요소·요청사항 더하기).
  누르면 onPick(tab) — 설정 창은 그 탭을 펼치고, 패널·휴대폰 막대는 설정 창을 그 탭으로 연다. 값은 사양 글(SpecInput)이나 탭 안에서 바꾼다
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { SignObject, SignPart } from '../core/model';
  import { categoryOf, productById } from '../core/catalog';
  import { NAMED_COLORS, paintLabel as paintOf } from '../core/materials';
  import { addPrintItem, commitParts, newPart, partKindsFor, partsOf } from '../core/parts';
  import { componentOf } from '../core/components';
  import { quoteObject, won } from '../core/quote';

  /** 탭 이름: body | part:<id> | layout | note | price */
  export type QuickTab = string;
  let { obj, ro, update, compact = false, active = null, onPick }: {
    obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void; compact?: boolean;
    /** 지금 펼친 탭 (설정 창) */
    active?: QuickTab | null;
    onPick: (tab: QuickTab) => void;
  } = $props();

  const category = $derived(categoryOf(obj));
  const product = $derived(productById(obj.productId));
  const parts = $derived(partsOf(obj));
  const kinds = $derived(partKindsFor(obj));
  const hasItems = $derived(parts.some((p) => p.items.length));
  const size = $derived(app.sizeOf(obj));
  const total = $derived(app.isCustomer ? 0 : quoteObject(size ? { ...obj, widthMm: size.w, heightMm: size.h } : obj, app.prices).reduce((a, l) => a + l.amount, 0));
  let adding = $state(false);

  const bodyColor = $derived(paintOf(obj.options, 'paint') ?? paintOf(obj.options, 'face') ?? paintOf(obj.options, 'framePaint'));
  const dot = (label: string | null) => (label && /^#[0-9a-f]{6}$/i.test(label) ? label : NAMED_COLORS.find((c) => c.label === label)?.hex ?? null);
  /** 구성 요소 칩 문구 — 종류 모듈이 정한다 (0단계) */
  function partChip(p: SignPart): { kind: string; text: string; color: string | null } {
    const c = componentOf(p.kind);
    return { kind: c.label, ...c.chip(p) };
  }
  const addable = $derived.by(() => {
    const out: { id: string; label: string; run: () => void }[] = [];
    const addPart = (kind: SignPart['kind'], type?: string) => () => {
      const ps: SignPart[] = JSON.parse(JSON.stringify(parts));
      const np = newPart(kind, type);
      ps.push(np);
      update(commitParts(obj, ps));
      onPick(`part:${np.id}`);
    };
    // 후렉스·천갈이: 미리보기 글자·그림 (2026-10-21 "uv후렉스출력에 배경색 글자 그림 옵션" → 미리보기, 실제 원고는 디자인 파일)
    if (obj.productId === 'board-flex' || obj.productId === 'board-reface') for (const k of ['text', 'image'] as const) out.push({ id: `add-print-${k}`, label: k === 'text' ? '+ 글자 미리보기' : '+ 그림 미리보기', run: () => { const r = addPrintItem(obj, k); update(r.patch); onPick(`part:${r.partId}`); } });
    if (kinds.includes('channel')) out.push({ id: 'add-part-channel', label: '+ 채널', run: addPart('channel') });
    if (kinds.includes('scashi')) out.push({ id: 'add-part-scashi', label: '+ 스카시', run: addPart('scashi') });
    if (kinds.includes('sheet')) { out.push({ id: 'add-part-sheet-uv', label: '+ UV 출력', run: addPart('sheet', 'sh-print') }); out.push({ id: 'add-part-sheet-cut', label: '+ 재질 시트', run: addPart('sheet', 'sh-cut') }); }
    for (const k of kinds.filter((x) => !componentOf(x).takesItems)) out.push({ id: `add-part-${k}`, label: `+ ${componentOf(k).label}`, run: addPart(k) }); // 상단 조명·몰딩·지주·LED 모듈 (2026-10-19)
    if (!obj.note?.trim()) out.push({ id: 'quick-add-note', label: '+ 요청사항', run: () => onPick('note') });
    return out;
  });
  const pick = (tab: QuickTab) => { adding = false; onPick(tab); };
</script>

{#if category}
<div class="quickspec" class:compact data-testid="quick-spec">
  <div class="chips">
    <!-- 단면 쌓기 (재료 조합 S1, 2026-10-22 "단면쌓기는 인터페이스야") — 설정 창 첫 화면. 빠른 막대(compact)에는 없음 -->
    {#if !compact && kinds.length}<button class="chip" class:on={active === 'stack'} data-testid="quick-stack" onclick={() => pick('stack')}><small>단면</small>쌓기</button>{/if}
    {#if product || category !== 'sheet'}
      <button class="chip" class:on={active === 'body'} data-testid="quick-body" onclick={() => pick('body')}>
        <small>몸통</small>{product?.name ?? '종류'}{#if bodyColor}{#if dot(bodyColor)}<i style:background={dot(bodyColor)}></i>{/if}{bodyColor}{/if}
      </button>
    {/if}
    {#each parts as p (p.id)}
      {@const c = partChip(p)}
      <button class="chip" class:on={active === `part:${p.id}`} data-testid="quick-part" data-kind={p.kind} data-part-id={p.id} onclick={() => pick(`part:${p.id}`)}>
        <small>{c.kind}</small>{c.text}{#if c.color}{#if dot(c.color)}<i style:background={dot(c.color)}></i>{/if}{c.color}{/if}
      </button>
    {/each}
    {#if hasItems}<button class="chip" class:on={active === 'layout'} data-testid="quick-layout" onclick={() => pick('layout')}><small>배치</small>정면도</button>{/if}
    {#if obj.note?.trim()}<button class="chip note" class:on={active === 'note'} data-testid="quick-note" title={obj.note} onclick={() => pick('note')}><small>메모</small>{obj.note.trim().split('\n')[0].slice(0, 14)}{obj.note.trim().length > 14 ? '…' : ''}</button>{/if}
    {#if total}<button class="chip" class:on={active === 'price'} data-testid="quick-price" onclick={() => pick('price')}><small>금액</small>{won(total)}</button>{/if}
    {#if !ro && addable.length}
      <button class="chip add" class:on={adding} data-testid="quick-add" title="구성 요소·요청사항 더하기" onclick={() => (adding = !adding)}>+</button>
    {/if}
  </div>
  {#if adding}
    <div class="menu" data-testid="quick-add-menu">
      {#each addable as a (a.id)}<button class="btn small" data-testid={a.id} onclick={() => { adding = false; a.run(); }}>{a.label}</button>{/each}
    </div>
  {/if}
</div>
{/if}

<style>
  .quickspec { display: flex; flex-direction: column; gap: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--input, rgba(255,255,255,0.04)); color: var(--text); font-size: 12px; cursor: pointer; }
  .chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .chip.add { padding: 2px 9px; font-size: 14px; font-weight: 700; color: var(--muted); }
  .chip.note { max-width: 180px; }
  .chip small { color: var(--muted); font-size: 10px; }
  .chip i { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); display: inline-block; }
  .menu { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px dashed var(--line); }
  .compact .chip { font-size: 11px; padding: 3px 8px; }
</style>
