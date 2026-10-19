<!--
  사양 글 한 줄 (2026-10-17 사용자: "사이즈 작성하고 다음줄에 텍스트로 사용자가 입력하면 퀵설정과 같은 요소가 생성되게",
  "글은 해당 내용을 대화상자에서 체킹하고 적용하면 없어지게"). Enter → 알아본 항목을 체크 목록으로 확인 → [적용]하면 글은 비워지고 칩만 남는다.
  패널(처음 만들 때)과 설정 창이 같이 쓴다
-->
<script lang="ts">
  import type { SignObject } from '../core/model';
  import { applySpecItems, parseSpecText, type SpecItem } from '../core/specText';
  import { app } from '../state.svelte';
  import { sampleOf } from '../core/specSamples';
  import { postSpecSample, suggestSpecRule } from '../projects';
  import { meaningChoices, meaningKey, normPhrase, type Meaning } from '../core/specRules';
  import { termHint } from '../core/terms';

  let { obj, ro, update }: { obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void } = $props();
  let text = $state('');
  let items = $state<SpecItem[] | null>(null);
  let checked = $state<boolean[]>([]);
  function parse() {
    const t = text.trim();
    if (!t) return;
    items = parseSpecText(t, obj, app.colorLibrary, app.specRules, app.specDefaults); // 그 종류의 옵션 값(비조명·양면…)·내 컬러 카드 이름·내 사전·전국 기본값도 맞춘다
    checked = items.map(() => true);
    meanings = []; suggestions = []; dispute = null;
    const left = items.find((i) => i.kind === 'note')?.text;
    if (left && app.account) suggestSpecRule(normPhrase(left)).then((s) => { if (items?.some((i) => i.kind === 'note' && i.text === left)) suggestions = s as { meaning: Meaning[]; count: number }[]; }).catch(() => {});
  }
  /** 못 알아본 글 보내기 (2026-10-18 사용자: "메모로 전환하는 글만 모아서 ai로 전환하는 방식으로") — 요청사항으로 넘어간 부분이 있을 때만 보이고, 기기에 기억 */
  let share = $state(localStorage.getItem('ganpanda.specShare') !== '0');
  const sample = $derived(items ? sampleOf(text, items, obj.productId) : null);
  /** 뜻 묻기 (2026-10-18 V1, docs/features/spec-vocabulary.md): 못 알아본 말에 사용자가 고른 뜻 — 적용하면 개인 규칙으로 저장되고 다음부터 바로 알아본다. 추천 = 다른 계정들이 많이 정한 뜻(대세) */
  let meanings = $state<Meaning[]>([]);
  let suggestions = $state<{ meaning: Meaning[]; count: number; regionCount?: number }[]>([]);
  const choices = $derived(meaningChoices(obj, app.colorLibrary));
  const groups = $derived([...new Set(choices.map((c) => c.group))]);
  const addMeaning = (id: string) => { const c = choices.find((x) => x.id === id); if (c && !meanings.some((m) => meaningKey([m]) === meaningKey([c.item]))) meanings = [...meanings, c.item]; };
  /** 이의 (V2, 2026-10-19 "대세가 기본값", 이의 = 한 표 + 개인 규칙): 전국 기본값으로 알아본 말에 "다른 뜻이에요" → 그 말의 뜻을 다시 고른다 */
  let dispute = $state<string | null>(null);
  const askPhrase = $derived(dispute ?? (items?.find((i) => i.kind === 'note')?.text ?? null));
  function startDispute(phrase: string) { dispute = phrase; meanings = []; suggestions = []; if (app.account) suggestSpecRule(phrase).then((s) => { if (dispute === phrase) suggestions = s as { meaning: Meaning[]; count: number }[]; }).catch(() => {}); }
  function apply() {
    if (!items || ro) return;
    const note = items.find((i) => i.kind === 'note');
    const phrase = dispute ?? (note ? normPhrase(note.text) : null);
    const learned = phrase && meanings.length ? { phrase, meaning: meanings } : null;
    // 뜻을 골랐으면 그 항목을 적용하고 메모(또는 이의한 전국 항목)는 넣지 않는다 (규칙으로 배움). 아니면 지금처럼 메모 + 표본
    const replaced = (it: SpecItem) => !!learned && (dispute ? it.src?.phrase === dispute : it.kind === 'note');
    const picked = [...items.filter((it, i) => checked[i] && !replaced(it)), ...(learned ? learned.meaning : [])];
    if (picked.length) update(applySpecItems(obj, picked));
    if (learned) void app.saveSpecRule(learned);
    else if (sample && share) postSpecSample(sample).catch(() => {}); // 로그인 안 했거나 오프라인이면 그냥 넘어간다
    items = null; text = ''; meanings = []; suggestions = []; dispute = null;
  }
  const setShare = (v: boolean) => { share = v; try { localStorage.setItem('ganpanda.specShare', v ? '1' : '0'); } catch { /* 저장 못 해도 동작 */ } };
  const cancel = () => (items = null);
</script>

<div class="spec" data-testid="spec-input">
  <form class="row" onsubmit={(e) => { e.preventDefault(); parse(); }}>
    <input data-testid="spec-text" bind:value={text} disabled={ro} placeholder="사양을 글로: 예) 갈바 흰색 채널 갈색 후광 4000K" />
    <button class="btn small" type="submit" data-testid="spec-parse" disabled={ro || !text.trim()}>확인</button>
  </form>
  {#if items}
    <div class="confirm" data-testid="spec-confirm" role="dialog" aria-label="알아본 사양">
      {#if items.length}
        <p>이렇게 적용할까요? 아닌 것은 체크를 빼세요.</p>
        {#each items as it, i (i)}
          <label class="item" data-testid="spec-item" data-kind={it.kind} data-src={it.src?.tag}><input type="checkbox" bind:checked={checked[i]} /> {it.label}
            {#if termHint(it, obj, app.prices)}<small class="term" data-testid="spec-term" title="그 품목에 연결된 공급사의 용어 — 주문서에는 이 이름으로">→ {termHint(it, obj, app.prices)}</small>{/if}
            {#if it.src?.tag === '전국' && dispute !== it.src.phrase}<button class="btn small" data-testid="spec-dispute" title="이 말을 다른 뜻으로 씁니다 — 내 사전에 저장되고 그 뜻에 한 표" onclick={(e) => { e.preventDefault(); startDispute(it.src!.phrase); }}>다른 뜻이에요</button>{/if}</label>
        {/each}
        {#if sample || dispute}
          <div class="ask" data-testid="spec-ask">
            <p><b>'{askPhrase}'</b>는 무엇인가요? 뜻을 고르면 다음부터 바로 알아봅니다.{#if dispute} <small>(전국 기본값과 다른 내 뜻 — 내 사전에 저장)</small>{/if}</p>
            {#if suggestions.length}
              <div class="suggest">{#each suggestions as s, i (i)}<button class="btn small" data-testid="spec-suggest" title="다른 사용자 {s.count}곳이 이 뜻으로 씁니다{s.regionCount ? ` (같은 지역 ${s.regionCount}곳)` : ''}" onclick={() => (meanings = s.meaning)}>추천: {s.meaning.map((m) => m.label).join(' · ')} <small>({s.regionCount ? `같은 지역 ${s.regionCount}곳 · ` : ''}{s.count}곳)</small></button>{/each}</div>
            {/if}
            <select data-testid="spec-meaning" value="" disabled={ro} onchange={(e) => { addMeaning(e.currentTarget.value); e.currentTarget.value = ''; }}>
              <option value="">설정으로 고르기…</option>
              {#each groups as g (g)}<optgroup label={g}>{#each choices.filter((c) => c.group === g) as c (c.id)}<option value={c.id}>{c.label}</option>{/each}</optgroup>{/each}
            </select>
            {#if meanings.length}
              <div class="chips">{#each meanings as m, i (meaningKey([m]))}<span class="chip" data-testid="spec-meaning-chip">{m.label}<button class="icon" title="빼기" onclick={() => (meanings = meanings.filter((_, j) => j !== i))}>✕</button></span>{/each}</div>
            {:else}
              <small>고르지 않으면 요청사항(메모)으로 들어갑니다.</small>
            {/if}
          </div>
        {/if}
        {#if sample && !meanings.length && !dispute}
          <label class="item share" data-testid="spec-share" title="못 알아본 글만 보냅니다 (프로젝트·사진·고객 정보 없음). 퀵입력이 더 많은 표현을 알아보게 하는 데 씁니다"><input type="checkbox" checked={share} onchange={(e) => setShare(e.currentTarget.checked)} /> 못 알아본 글을 보내 퀵입력 개선에 쓰기</label>
        {/if}
        <div class="acts">
          <button class="btn small primary" data-testid="spec-apply" onclick={apply}>적용</button>
          <button class="btn small" data-testid="spec-cancel" onclick={cancel}>취소</button>
        </div>
      {:else}
        <p>알아본 항목이 없습니다. 종류(갈바·후렉스·포맥스…), 색(흰색·갈색…), 채널(전광·후광), LED(4000K), 사이즈(3000x600)를 써 보세요.</p>
        <div class="acts"><button class="btn small" onclick={cancel}>닫기</button></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .spec { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; gap: 6px; }
  .row input { flex: 1; min-width: 0; font-size: 13px; }
  .confirm { border: 1px solid rgba(255, 204, 0, 0.5); background: rgba(255, 204, 0, 0.06); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .confirm p { margin: 0 0 4px; color: var(--muted); }
  label.item { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 12px; color: var(--text); }
  label.item input { width: auto; margin: 0; }
  .acts { display: flex; gap: 6px; margin-top: 4px; }
  label.item.share { color: var(--muted); margin-top: 4px; }
  .ask { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255, 204, 0, 0.4); }
  .ask p { margin: 0; color: var(--text); }
  .ask small { color: var(--muted); }
  .term { color: var(--muted); margin-left: 4px; }
  .suggest { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 4px 1px 8px; border-radius: 10px; background: rgba(90, 168, 255, 0.18); font-size: 12px; }
  .chip .icon { width: 18px; height: 18px; font-size: 10px; }
</style>
