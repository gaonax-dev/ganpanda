<!--
  칩 = 탭 (2026-10-17 사용자: "난 칩을 일종의 탭으로 작동하게 하고 싶다. 현재 상세에 구성된 내용을 칩을 클릭하고 보여지게하고 입력한 문자를 사용해 상세 내역을 자동으로 구성").
  칩: [몸통 종류·색] [구성 요소마다 하나: 채널 후광 ●갈색 4000K / 스카시 … / 시트 …] [배치] [메모] [금액] 그리고 끝에 [+](구성 요소·요청사항 더하기).
  누르면 onPick(tab) — 설정 창은 그 탭을 펼치고, 패널·휴대폰 막대는 설정 창을 그 탭으로 연다. 값은 사양 글(SpecInput)이나 탭 안에서 바꾼다
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { SignObject, SignPart } from '../core/model';
  import { CHANNEL_OPTIONS, categoryOf, productById } from '../core/catalog';
  import { NAMED_COLORS, PAINT_SYSTEMS } from '../core/materials';
  import { commitParts, newPart, partKindsFor, partLabel, partSpecOf, partsOf } from '../core/parts';
  import { LED_KELVIN } from '../core/quickSpec';
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

  /** 도색 객체 → 색 이름(기본색) 또는 "RAL 9005" */
  const paintOf = (opts: Record<string, unknown> | undefined, prefix: string): string | null => {
    const sys = opts?.[`${prefix}System`] as string | undefined, code = opts?.[`${prefix}Code`] as string | undefined;
    if (!sys || sys === PAINT_SYSTEMS[0]) return null;
    return sys === PAINT_SYSTEMS[1] ? code ?? null : code ? `${sys} ${code}` : sys;
  };
  const bodyColor = $derived(paintOf(obj.options, 'paint') ?? paintOf(obj.options, 'framePaint'));
  const dot = (label: string | null) => NAMED_COLORS.find((c) => c.label === label)?.hex ?? null;
  /** 구성 요소 칩 문구 */
  function partChip(p: SignPart): { kind: string; text: string; color: string | null } {
    if (p.kind === 'channel') {
      const led = p.options?.ledColor as string | undefined;
      return { kind: '채널', text: `${(CHANNEL_OPTIONS.find((c) => c.id === p.type)?.label ?? p.type).replace(' 채널', '')}${led ? ` ${LED_KELVIN[led] ?? led}` : ''}`, color: paintOf(p.options, 'body') };
    }
    if (p.kind === 'scashi') return { kind: '스카시', text: partLabel(p).replace(' 스카시', ''), color: paintOf(p.options, 'paint') };
    return { kind: '시트', text: partSpecOf(p), color: null };
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
    if (kinds.includes('channel')) out.push({ id: 'add-part-channel', label: '+ 채널', run: addPart('channel') });
    if (kinds.includes('scashi')) out.push({ id: 'add-part-scashi', label: '+ 스카시', run: addPart('scashi') });
    if (kinds.includes('sheet')) { out.push({ id: 'add-part-sheet-uv', label: '+ UV 출력', run: addPart('sheet', 'sh-print') }); out.push({ id: 'add-part-sheet-cut', label: '+ 재질 시트', run: addPart('sheet', 'sh-cut') }); }
    if (!obj.note?.trim()) out.push({ id: 'quick-add-note', label: '+ 요청사항', run: () => onPick('note') });
    return out;
  });
  const pick = (tab: QuickTab) => { adding = false; onPick(tab); };
</script>

{#if category}
<div class="quickspec" class:compact data-testid="quick-spec">
  <div class="chips">
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
  .chip.on { border-color: var(--accent); color: var(--accent); background: rgba(255, 204, 0, 0.08); }
  .chip.add { padding: 2px 9px; font-size: 14px; font-weight: 700; color: var(--muted); }
  .chip.note { max-width: 180px; }
  .chip small { color: var(--muted); font-size: 10px; }
  .chip i { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); display: inline-block; }
  .menu { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px dashed var(--line); }
  .compact .chip { font-size: 11px; padding: 3px 8px; }
</style>
