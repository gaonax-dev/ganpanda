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
  import { familiesFor, subsFor, templatesFor, type FrameSub, type SignFamily, type SignTemplate } from '../core/signTemplates';

  let { obj, ro, update, compact = false }: { obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void; compact?: boolean } = $props();

  // 간판은 먼저 프레임간판 / 채널간판, 그다음 그 갈래의 완성품 (2026-10-27 "간판 종류 선택에 프레임간판, 체널간판 으로 먼저 분류를 하고 세부 사항으로 간다")
  const families = $derived(familiesFor(categoryOf(obj)));
  let family = $state<SignFamily | null>(null);
  // 프레임간판은 다시 조명·비조명·돌출 (2026-10-27)
  const subs = $derived(subsFor(categoryOf(obj), family));
  let sub = $state<FrameSub | null>(null);
  /** 지금 고를 카드: 갈래 → 세부 갈래 → 완성품 */
  const choices = $derived(families.length && !family ? families : subs.length && !sub ? subs : null);
  const templates = $derived(templatesFor(categoryOf(obj), families.length ? family : null, subs.length ? sub : null));
  /** 한 단계 위로 */
  const back = () => { if (sub) sub = null; else family = null; };
  const backLabel = $derived(sub ? FRAME_LABEL(sub) : families.find((f) => f.id === family)?.label ?? '');
  function FRAME_LABEL(id: FrameSub) { return subs.find((f) => f.id === id)?.label ?? ''; }
  function choose(id: string) { if (families.length && !family) family = id as SignFamily; else sub = id as FrameSub; }
  const anyTemplates = $derived(templatesFor(categoryOf(obj)).length > 0);
  /** 고른 완성품 (칸 채우는 중) */
  let tpl = $state<SignTemplate | null>(null);
  let step = $state(0);
  /** 사진 펼침: 정하지 않았으면 새 사인물(글자·그림이 아직 없음 — 스카시 분류는 빈 스카시가 기본으로 있다)일 때 */
  let open = $state<boolean | null>(null);
  const shown = $derived(open ?? (!tpl && !partsOf(obj).some((p) => p.items.length)));
  // 분류가 바뀌면 처음부터 (그 분류의 완성품)
  let lastCat: ReturnType<typeof categoryOf> | undefined;
  $effect(() => { const c = categoryOf(obj); if (lastCat !== undefined && c !== lastCat) { tpl = null; step = 0; open = null; family = null; sub = null; } lastCat = c; });
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

{#if anyTemplates && !ro}
  <div class="tq" class:compact data-testid="tpl-quick">
    {#if shown}
      <div class="head">
        {#if families.length && family}<button class="btn small" data-testid="tpl-family-back" title="한 단계 위로" onclick={back}>‹ {backLabel}</button>{/if}
        <b>{choices ? '간판 종류' : '완성품 사진에서 고르기'}</b><button class="icon" data-testid="tpl-close" title="닫기" onclick={() => (open = false)}>✕</button>
      </div>
      {#if choices}
        <div class="families" class:three={choices.length === 3}>
          {#each choices as f (f.id)}
            <button class="family" data-testid="tpl-family" data-family={f.id} title={f.desc} onclick={() => choose(f.id)}>
              <img src={f.img} alt="" loading="lazy" width="120" height="80" />
              <b>{f.label}</b><small>{f.desc}</small>
            </button>
          {/each}
        </div>
      {:else}
      <div class="grid">
        {#each templates as t (t.id)}
          <button class="pick" data-testid="tpl-pick" title={t.desc} onclick={() => pick(t)}>
            <img src={t.img} alt={t.label} loading="lazy" width="120" height="80" />
            <span>{t.label}</span>
          </button>
        {/each}
      </div>
      {/if}
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
      <button class="btn small" data-testid="tpl-open" onclick={() => { open = true; family = null; sub = null; }}>완성품 사진에서 고르기</button>
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
  .families { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .families.three { grid-template-columns: repeat(3, 1fr); }
  .family b { word-break: keep-all; }
  .three .family b { font-size: 13px; }
  /* 휴대폰 세 갈래: 한 줄에 작은 카드 셋 (설명은 숨김 — 막대가 낮게) */
  .compact .families.three .family { display: flex; flex-direction: column; gap: 3px; padding: 4px; }
  .compact .families.three .family img { width: 100%; }
  .compact .families.three .family small { display: none; }
  .family { display: flex; flex-direction: column; gap: 3px; padding: 6px; background: var(--input); border: 1px solid var(--line); border-radius: 10px; color: var(--text); font: inherit; cursor: pointer; text-align: left; }
  .family:hover { border-color: var(--accent); }
  .family img { width: 100%; height: auto; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 6px; }
  .family b { font-size: 14px; }
  .family small { color: var(--muted); font-size: 11px; line-height: 1.3; }
  /* 휴대폰 빠른 막대: 낮게 — 작은 그림 옆에 이름 (막대가 사진을 덜 가리게) */
  .compact .family { display: grid; grid-template-columns: 56px 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: center; padding: 4px; }
  .compact .family img { grid-row: 1 / 3; width: 56px; }
  .compact .family small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .step { display: flex; flex-direction: column; gap: 6px; padding: 6px 8px; border: 1px solid var(--accent); border-radius: 10px; }
  .colors { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sw { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line); cursor: pointer; padding: 0; }
  .sw.on { outline: 2px solid var(--accent); outline-offset: 2px; }
  .colors input[type='color'] { width: 40px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; }
  .txt { width: 100%; font-size: 15px; padding: 8px; }
  .nav { display: flex; justify-content: space-between; gap: 6px; }
</style>
