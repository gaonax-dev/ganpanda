<!--
  빠른 설정 (2026-10-17 사용자: "현재설정창과 퀵설정으로 만들수 있을까? 사이즈 아래에 갈바 흰색 / 체널 갈색 / 후광4000k").
  세 칩: [몸통 종류 · 색] [채널 종류 · 색] [LED 색온도]. 누르면 그 칩 아래에 선택지가 펼쳐진다. 값은 기존 옵션·구성 요소에 저장(core/quickSpec.ts).
  설정 창(치수 아래)과 휴대폰 빠른 막대가 같이 쓴다
-->
<script lang="ts">
  import type { SignObject } from '../core/model';
  import { CHANNEL_OPTIONS, categoryOf, productsOf, takesLetters } from '../core/catalog';
  import { NAMED_COLORS } from '../core/materials';
  import { applyQuick, ledLabel, quickSpecOf, type QuickPatch } from '../core/quickSpec';

  let { obj, ro, update, compact = false }: { obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void; compact?: boolean } = $props();
  const q = $derived(quickSpecOf(obj));
  const category = $derived(categoryOf(obj));
  const letters = $derived(takesLetters(obj.productId));
  let open = $state<'body' | 'channel' | 'led' | null>(null);
  const apply = (p: QuickPatch) => { if (!ro) update(applyQuick(obj, p)); };
  const LEDS = ['백색', '주백색', '전구색', '빨강', '파랑', 'RGB'];
  const toggle = (k: typeof open) => (open = open === k ? null : k);
</script>

{#if category && category !== 'sheet'}
<div class="quickspec" class:compact data-testid="quick-spec">
  <div class="chips">
    <button class="chip" class:on={open === 'body'} data-testid="quick-body" onclick={() => toggle('body')}>
      <small>몸통</small>{q.body.name ?? '종류'}{#if q.body.color}<i style:background={NAMED_COLORS.find((c) => c.label === q.body.color)?.hex ?? 'transparent'}></i>{q.body.color}{/if}
    </button>
    {#if letters}
      <button class="chip" class:on={open === 'channel'} data-testid="quick-channel" onclick={() => toggle('channel')}>
        <small>채널</small>{q.channel ? q.channel.name.replace(' 채널', '') : '없음'}{#if q.channel?.color}<i style:background={NAMED_COLORS.find((c) => c.label === q.channel!.color)?.hex ?? 'transparent'}></i>{q.channel.color}{/if}
      </button>
      {#if q.channel && q.channel.type !== 'ch-galva'}
        <button class="chip" class:on={open === 'led'} data-testid="quick-led" onclick={() => toggle('led')}>
          <small>LED</small>{q.led ? (q.led.kelvin ? `${q.led.value} ${q.led.kelvin}` : q.led.value) : '색 선택'}
        </button>
      {/if}
    {/if}
  </div>
  {#if open === 'body'}
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
  {/if}
</div>
{/if}

<style>
  .quickspec { display: flex; flex-direction: column; gap: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--input, rgba(255,255,255,0.04)); color: var(--text); font-size: 12px; cursor: pointer; }
  .chip.on { border-color: var(--accent); color: var(--accent); }
  .chip small { color: var(--muted); font-size: 10px; }
  .chip i { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.35); display: inline-block; }
  .pick { display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px dashed var(--line); }
  .pick label { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .hint { color: var(--muted); font-size: 11px; }
  .compact .chip { font-size: 11px; padding: 3px 8px; }
</style>
