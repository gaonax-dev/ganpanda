<!--
  빠른 설정 칩 (2026-10-17 사용자: "현재설정창과 퀵설정으로 만들수 있을까? 사이즈 아래에 갈바 흰색 / 체널 갈색 / 후광4000k", "칩끝에 +마크로 수동으로 추가할수 있게").
  칩: [몸통 종류 · 색] [채널 종류 · 색] [LED 색온도] (+ 값이 있으면 [두께] [메모]) 그리고 끝에 [+] — 아직 없는 요소를 수동으로 더한다.
  칩을 누르면 그 칩 아래에 선택지(onPick 이 있으면 대신 그것을 부른다 — 패널에서는 설정 창을 그 자리로 연다). 값은 기존 옵션·구성 요소에 저장(core/quickSpec.ts)
-->
<script lang="ts">
  import type { SignObject } from '../core/model';
  import { CHANNEL_OPTIONS, categoryOf, productsOf, takesLetters, thicknessFieldOf } from '../core/catalog';
  import { NAMED_COLORS } from '../core/materials';
  import { applyQuick, ledLabel, quickSpecOf, type QuickPatch } from '../core/quickSpec';

  export type QuickKind = 'body' | 'channel' | 'led' | 'thick' | 'note';
  let { obj, ro, update, compact = false, onPick, initialOpen = null }: {
    obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void; compact?: boolean;
    /** 칩을 눌렀을 때 선택지 대신 부를 것 (패널: 설정 창을 그 자리로) */
    onPick?: (k: QuickKind) => void;
    /** 열어 둘 선택지 (설정 창이 칩에서 열렸을 때) */
    initialOpen?: QuickKind | null;
  } = $props();
  const q = $derived(quickSpecOf(obj));
  const category = $derived(categoryOf(obj));
  const letters = $derived(takesLetters(obj.productId));
  const thick = $derived(thicknessFieldOf(obj.productId));
  // svelte-ignore state_referenced_locally
  let open = $state<QuickKind | null>(initialOpen);
  let adding = $state(false);
  const apply = (p: QuickPatch) => { if (!ro) update(applyQuick(obj, p)); };
  const LEDS = ['백색', '주백색', '전구색', '빨강', '파랑', 'RGB'];
  function toggle(k: QuickKind) {
    if (onPick) { onPick(k); return; }
    open = open === k ? null : k;
    adding = false;
  }
  /** [+] 로 더할 수 있는 것: 아직 칩이 없거나 값이 없는 요소 */
  const addable = $derived.by(() => {
    const out: { k: QuickKind; label: string }[] = [];
    if (q.body.paintKey && !q.body.color) out.push({ k: 'body', label: '몸통 색' });
    if (letters && !q.channel) out.push({ k: 'channel', label: '채널' });
    if (letters && q.channel && q.channel.type !== 'ch-galva' && !q.led) out.push({ k: 'led', label: 'LED 색' });
    if (thick && !obj.depthMm) out.push({ k: 'thick', label: thick.label });
    if (!obj.note?.trim()) out.push({ k: 'note', label: '요청사항' });
    return out;
  });
  function add(k: QuickKind) {
    adding = false;
    if (k === 'channel' && !q.channel) apply({ channelType: 'ch-front' });
    if (k === 'led' && !q.channel) apply({ channelType: 'ch-front' });
    if (onPick) { onPick(k); return; }
    open = k;
  }
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Number(v)));
  const colorDot = (label: string | null) => NAMED_COLORS.find((c) => c.label === label)?.hex ?? 'transparent';
</script>

{#if category && category !== 'sheet'}
<div class="quickspec" class:compact data-testid="quick-spec">
  <div class="chips">
    <button class="chip" class:on={open === 'body'} data-testid="quick-body" onclick={() => toggle('body')}>
      <small>몸통</small>{q.body.name ?? '종류'}{#if q.body.color}<i style:background={colorDot(q.body.color)}></i>{q.body.color}{/if}
    </button>
    {#if letters && q.channel}
      <button class="chip" class:on={open === 'channel'} data-testid="quick-channel" onclick={() => toggle('channel')}>
        <small>채널</small>{q.channel.name.replace(' 채널', '')}{#if q.channel.color}<i style:background={colorDot(q.channel.color)}></i>{q.channel.color}{/if}
      </button>
      {#if q.channel.type !== 'ch-galva' && q.led}
        <button class="chip" class:on={open === 'led'} data-testid="quick-led" onclick={() => toggle('led')}>
          <small>LED</small>{q.led.kelvin ? `${q.led.value} ${q.led.kelvin}` : q.led.value}
        </button>
      {/if}
    {/if}
    {#if thick && obj.depthMm}
      <button class="chip" class:on={open === 'thick'} data-testid="quick-thick" onclick={() => toggle('thick')}><small>두께</small>{obj.depthMm}{thick.unit === 'T' ? 'T' : 'mm'}</button>
    {/if}
    {#if obj.note?.trim()}
      <button class="chip note" class:on={open === 'note'} data-testid="quick-note" title={obj.note} onclick={() => toggle('note')}><small>메모</small>{obj.note.trim().split('\n')[0].slice(0, 14)}{obj.note.trim().length > 14 ? '…' : ''}</button>
    {/if}
    {#if !ro && addable.length}
      <button class="chip add" class:on={adding} data-testid="quick-add" title="요소 더하기" onclick={() => { adding = !adding; open = null; }}>+</button>
    {/if}
  </div>
  {#if adding}
    <div class="pick" data-testid="quick-add-menu">
      {#each addable as a (a.k)}<button class="btn small" data-testid="quick-add-{a.k}" onclick={() => add(a.k)}>+ {a.label}</button>{/each}
    </div>
  {:else if open === 'body'}
    <div class="pick" data-testid="quick-body-pick">
      <label>종류<select data-testid="quick-product" value={q.body.productId ?? ''} disabled={ro} onchange={(e) => apply({ productId: e.currentTarget.value })}>
        {#each productsOf(category) as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select></label>
      {#if q.body.paintKey}
        <label>색<select data-testid="quick-body-color" value={NAMED_COLORS.some((c) => c.label === q.body.color) ? q.body.color : ''} disabled={ro} onchange={(e) => apply({ bodyColor: e.currentTarget.value || null })}>
          <option value="">{q.body.color && !NAMED_COLORS.some((c) => c.label === q.body.color) ? `${q.body.color} (코드)` : '도색 없음'}</option>
          {#each NAMED_COLORS as c (c.label)}<option value={c.label}>{c.label}</option>{/each}
        </select></label>
      {:else}<small class="hint">이 종류는 도색이 없습니다</small>{/if}
    </div>
  {:else if open === 'channel'}
    <div class="pick" data-testid="quick-channel-pick">
      <label>채널<select data-testid="quick-channel-type" value={q.channel?.type ?? ''} disabled={ro} onchange={(e) => apply({ channelType: e.currentTarget.value || null })}>
        <option value="">없음</option>
        {#each CHANNEL_OPTIONS as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
      </select></label>
      {#if q.channel}
        <label>색<select data-testid="quick-channel-color" value={NAMED_COLORS.some((c) => c.label === q.channel?.color) ? q.channel!.color : ''} disabled={ro} onchange={(e) => apply({ channelColor: e.currentTarget.value || null })}>
          <option value="">{q.channel.color && !NAMED_COLORS.some((c) => c.label === q.channel!.color) ? `${q.channel.color} (코드)` : '도색 없음'}</option>
          {#each NAMED_COLORS as c (c.label)}<option value={c.label}>{c.label}</option>{/each}
        </select></label>
      {/if}
    </div>
  {:else if open === 'led'}
    <div class="pick" data-testid="quick-led-pick">
      <label>LED 색<select data-testid="quick-led-color" value={q.led?.value ?? ''} disabled={ro} onchange={(e) => apply({ led: e.currentTarget.value })}>
        {#if !q.led}<option value="">선택</option>{/if}
        {#each LEDS as v (v)}<option value={v}>{ledLabel(v)}</option>{/each}
      </select></label>
    </div>
  {:else if open === 'thick' && thick}
    <div class="pick" data-testid="quick-thick-pick">
      <label>{thick.label}<input data-testid="quick-thick-input" type="number" min="0" step={thick.unit === 'T' ? 1 : 10} value={obj.depthMm ?? ''} disabled={ro} oninput={(e) => update({ depthMm: num(e.currentTarget.value) })} /><small>{thick.unit === 'T' ? 'T (mm)' : 'mm'}</small></label>
    </div>
  {:else if open === 'note'}
    <div class="pick" data-testid="quick-note-pick">
      <textarea data-testid="quick-note-input" rows="2" value={obj.note ?? ''} disabled={ro} placeholder="이 사인물의 배선 위치, 특수 가공, 현장 조건 등" oninput={(e) => update({ note: e.currentTarget.value || undefined })}></textarea>
    </div>
  {/if}
</div>
{/if}

<style>
  .quickspec { display: flex; flex-direction: column; gap: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--input, rgba(255,255,255,0.04)); color: var(--text); font-size: 12px; cursor: pointer; }
  .chip.on { border-color: var(--accent); color: var(--accent); }
  .chip.add { padding: 2px 9px; font-size: 14px; font-weight: 700; color: var(--muted); }
  .chip.note { max-width: 180px; }
  .chip small { color: var(--muted); font-size: 10px; }
  .chip i { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); display: inline-block; }
  .pick { display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px dashed var(--line); }
  .pick label { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .pick textarea { width: 100%; box-sizing: border-box; font-size: 12px; }
  .pick input[type='number'] { width: 80px; }
  .hint { color: var(--muted); font-size: 11px; }
  .compact .chip { font-size: 11px; padding: 3px 8px; }
</style>
