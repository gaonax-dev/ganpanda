<!--
  채널 미리보기 (2026-10-31 사용자: "그림카드로 체널 형태를 선택하면 글자 하나만 나오겠지 그아래 컬러를 지정하면 해당 면의 색상이 변경되게" → glTF·구운 라이트맵):
  지금 채널 구성 요소의 종류·옵션 → 키트 모델(G 한 글자)에 면별 색. 색을 바꾸면 바로, 종류가 바뀌면 모델을 바꾼다. 낮/밤, 끌어서 살짝 돌려 보기
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { kitLookFor, kitVariantFor, type KitPart } from '../core/channelKit';
  import type { KitView } from '../render/kitView';

  import { ensureKitCards, type KitCard } from '../render/kitCards.svelte';

  /** cards: 그려 둘 그림 카드(묶음) — 미리보기 화면으로 차례로 그린 뒤 지금 것을 다시 */
  let { part, cards = [] }: { part: KitPart; cards?: KitCard[] } = $props();
  const variant = $derived(kitVariantFor(part));
  const look = $derived(kitLookFor(part));
  let night = $state(false);
  let canvas: HTMLCanvasElement | null = $state(null);
  let view: KitView | null = null;
  let ready = $state(false);
  let shown = $state('');
  let kitSrc = $state({ source: '', version: 0 });

  $effect(() => {
    const c = canvas, v = variant, l = look, n = night;
    if (!c || !v) return;
    void (async () => {
      if (!view) {
        const { KitView } = await import('../render/kitView');
        if (!canvas) return;
        view = new KitView(c);
        view.setSize(c.clientWidth || 280, c.clientHeight || 180);
      }
      const ok = await view.show(v, l, n);
      if (ok && variant === v) { ready = true; shown = v; kitSrc = view?.source ?? kitSrc; }
    })();
  });
  // 그림 카드: 미리보기가 뜬 뒤 차례로 그리고 지금 것으로 되돌린다
  let cardsDone = '';
  /** 카드를 그리는 동안(같은 그림판을 카드 크기로 쓴다) 미리보기를 가린다 — 카드 크기 그림이 늘어나 보이지 않게 (2026-10-31) */
  let cardsBusy = $state(false);
  $effect(() => {
    const list = cards, r = ready;
    const sig = JSON.stringify(list.map((c) => c.variant + JSON.stringify(c.look)));
    if (!r || !view || !list.length || sig === cardsDone) return;
    cardsDone = sig;
    const v = view;
    cardsBusy = true;
    void ensureKitCards(v, list).then(async () => { if (view === v && variant) await v.show(variant, look, night); cardsBusy = false; });
  });
  onDestroy(() => { view?.dispose(); view = null; });

  let drag: { x: number; yaw: number } | null = null;
  let yaw = 0;
  const down = (e: PointerEvent) => { drag = { x: e.clientX, yaw }; (e.currentTarget as Element).setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => { if (!drag || !view) return; yaw = drag.yaw + (e.clientX - drag.x) / 200; view.turn(yaw); };
  const up = () => { drag = null; };
</script>

{#if variant}
  <div class="kit" data-testid="kit-preview" data-variant={variant} data-ready={ready && !cardsBusy && shown === variant ? 'true' : undefined} data-night={night || undefined}
    data-face={look.face} data-side={look.side} data-led={look.led} data-source={kitSrc.source} data-version={kitSrc.version}>
    <canvas bind:this={canvas} style:visibility={cardsBusy ? 'hidden' : 'visible'} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} aria-label="채널 미리보기 — 끌어서 돌려 보기"></canvas>
    <button class="dn" data-testid="kit-night" onclick={() => (night = !night)} title={night ? '낮으로' : '밤으로 (불 켠 모습)'}>{night ? '☀ 낮' : '☾ 밤'}</button>
    {#if !ready || cardsBusy}<span class="hint load">불러오는 중…</span>{/if}
  </div>
{/if}

<style>
  .kit { position: relative; width: 100%; aspect-ratio: 14 / 9; border-radius: 8px; overflow: hidden; background: linear-gradient(#2a2e36, #15181d); margin: 6px 0 8px; }
  canvas { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
  .dn { position: absolute; right: 6px; top: 6px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--line); background: color-mix(in srgb, var(--panel) 80%, transparent); color: var(--text); font-size: 12px; }
  .load { position: absolute; left: 10px; bottom: 8px; }
</style>
