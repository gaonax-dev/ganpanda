<!--
  사양 글 한 줄 (2026-10-17 사용자: "사이즈 작성하고 다음줄에 텍스트로 사용자가 입력하면 퀵설정과 같은 요소가 생성되게",
  "글은 해당 내용을 대화상자에서 체킹하고 적용하면 없어지게"). Enter → 알아본 항목을 체크 목록으로 확인 → [적용]하면 글은 비워지고 칩만 남는다.
  패널(처음 만들 때)과 설정 창이 같이 쓴다
-->
<script lang="ts">
  import type { SignObject } from '../core/model';
  import { applySpecItems, parseSpecText, type SpecItem } from '../core/specText';

  let { obj, ro, update }: { obj: SignObject; ro: boolean; update: (patch: Partial<SignObject>) => void } = $props();
  let text = $state('');
  let items = $state<SpecItem[] | null>(null);
  let checked = $state<boolean[]>([]);
  function parse() {
    const t = text.trim();
    if (!t) return;
    items = parseSpecText(t, obj); // 그 종류의 옵션 값(비조명·양면…)도 맞춘다
    checked = items.map(() => true);
  }
  function apply() {
    if (!items || ro) return;
    const picked = items.filter((_, i) => checked[i]);
    if (picked.length) update(applySpecItems(obj, picked));
    items = null; text = '';
  }
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
          <label class="item" data-testid="spec-item" data-kind={it.kind}><input type="checkbox" bind:checked={checked[i]} /> {it.label}</label>
        {/each}
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
</style>
