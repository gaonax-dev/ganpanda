<!--
  완성품 퀵 (2026-10-23 사용자: "퀵에서는 간판을 선택하고 사진중에 하나를 선택 … 이전의 완성품 구성에 변경 가능한 필드를 하나씩 대입해서 완성하는 거이야. 중간에 멈추면 거기까지 완성이다.")
  · 분류를 고른 새 사인물(구성 요소 없음)은 완성품 사진이 펼쳐진다 → 고르면 구성 통째로 → 바꿀 칸(색 → 글자)을 하나씩. 칸마다 바로 저장, [완료]·닫기 = 거기까지 완성
  · 패널(데스크톱)과 빠른 막대(휴대폰)가 같이 쓴다. compact = 사진 줄을 가로로 넘김
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { SignObject } from '../core/model';
  import { categoryOf } from '../core/catalog';
  import { partsOf } from '../core/parts';
  import { NAMED_COLORS } from '../core/materials';
  import { templatesFor, type SignTemplate } from '../core/signTemplates';

  let { obj, ro, update, compact = false }: { obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void; compact?: boolean } = $props();

  const templates = $derived(templatesFor(categoryOf(obj)));
  /** 고른 완성품 (칸 채우는 중) */
  let tpl = $state<SignTemplate | null>(null);
  let step = $state(0);
  /** 사진 펼침: 정하지 않았으면 새 사인물(구성 요소 없음)일 때 */
  let open = $state<boolean | null>(null);
  const shown = $derived(open ?? (!tpl && !partsOf(obj).length));
  const slots = $derived(tpl ? tpl.slots(obj) : []);
  const slot = $derived(slots[step]);
  const swatches = NAMED_COLORS.filter((c) => c.basic);

  function pick(t: SignTemplate) {
    app.editBoundary();
    update(t.apply(obj));
    app.editBoundary();
    tpl = t; step = 0; open = false;
  }
  const put = (v: string) => { if (slot) update(slot.write(obj, v)); };
  function next() { if (step + 1 >= slots.length) done(); else step++; }
  function done() { tpl = null; step = 0; open = false; }
</script>

{#if templates.length && !ro}
  <div class="tq" class:compact data-testid="tpl-quick">
    {#if shown}
      <div class="head"><b>완성품 사진에서 고르기</b><button class="icon" data-testid="tpl-close" title="닫기" onclick={() => (open = false)}>✕</button></div>
      <div class="grid">
        {#each templates as t (t.id)}
          <button class="pick" data-testid="tpl-pick" title={t.desc} onclick={() => pick(t)}>
            <img src={t.img} alt={t.label} loading="lazy" width="120" height="80" />
            <span>{t.label}</span>
          </button>
        {/each}
      </div>
    {:else if tpl && slot}
      <div class="step" data-testid="tpl-step">
        <div class="head">
          <img src={tpl.img} alt="" width="36" height="24" />
          <b data-testid="tpl-step-label">{step + 1}/{slots.length} {slot.label}</b>
          <button class="btn small" data-testid="tpl-done" title="여기까지 완성" onclick={done}>완료</button>
        </div>
        {#if slot.kind === 'color'}
          <div class="colors">
            {#each swatches as c (c.label)}
              <button class="sw" class:on={slot.read(obj) === c.hex} data-testid="tpl-color" data-hex={c.hex} title={c.label} style:background={c.hex} onclick={() => put(c.hex)}></button>
            {/each}
            <input type="color" data-testid="tpl-color-input" value={slot.read(obj) || '#ffffff'} onchange={(e) => put(e.currentTarget.value)} />
          </div>
        {:else}
          {#key slot.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="txt" data-testid="tpl-text" value={slot.read(obj)} placeholder="{slot.label} 내용" autofocus={!compact}
              onchange={(e) => put(e.currentTarget.value)} onkeydown={(e) => { if (e.key === 'Enter') { put(e.currentTarget.value); next(); } }} />
          {/key}
        {/if}
        <div class="nav">
          <button class="btn small" data-testid="tpl-prev" disabled={step === 0} onclick={() => step--}>이전</button>
          <button class="btn small primary" data-testid="tpl-next" onclick={next}>{step + 1 >= slots.length ? '완성' : '다음'}</button>
        </div>
      </div>
    {:else}
      <button class="btn small" data-testid="tpl-open" onclick={() => (open = true)}>완성품 사진에서 고르기</button>
    {/if}
  </div>
{/if}

<style>
  .tq { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
  .head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .head b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .head img { border-radius: 4px; object-fit: cover; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; max-height: 300px; overflow-y: auto; }
  .compact .grid { display: flex; overflow-x: auto; overflow-y: hidden; max-height: none; scroll-snap-type: x proximity; }
  .compact .pick { flex: 0 0 96px; scroll-snap-align: start; }
  .pick { display: flex; flex-direction: column; gap: 2px; padding: 3px; background: var(--input); border: 1px solid var(--line); border-radius: 8px; color: var(--text); font: inherit; font-size: 11px; cursor: pointer; text-align: left; }
  .pick img { width: 100%; height: auto; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 5px; }
  .pick span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .step { display: flex; flex-direction: column; gap: 6px; padding: 6px 8px; border: 1px solid var(--accent); border-radius: 10px; }
  .colors { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sw { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line); cursor: pointer; padding: 0; }
  .sw.on { outline: 2px solid var(--accent); outline-offset: 2px; }
  .colors input[type='color'] { width: 40px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; }
  .txt { width: 100%; font-size: 15px; padding: 8px; }
  .nav { display: flex; justify-content: space-between; gap: 6px; }
</style>
