<!-- 비밀번호 칸 + 눈 단추(보이기·숨기기) (2026-10-24 사용자: "비밀번호 쇼(눈아이콘) 버튼 있어야해") -->
<script lang="ts">
  let { value = $bindable(''), testid, autocomplete = 'current-password', placeholder = '' }: { value?: string; testid: string; autocomplete?: 'current-password' | 'new-password'; placeholder?: string } = $props();
  let show = $state(false);
</script>

<span class="pwf">
  <input data-testid={testid} type={show ? 'text' : 'password'} bind:value {autocomplete} {placeholder} autocapitalize="off" spellcheck="false" />
  <button type="button" class="eye" data-testid="{testid}-show" aria-pressed={show} aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'} title={show ? '숨기기' : '보기'} onclick={() => (show = !show)}>
    {#if show}
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
    {:else}
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /><line x1="3" y1="3" x2="21" y2="21" /></svg>
    {/if}
  </button>
</span>

<style>
  .pwf { position: relative; display: flex; }
  .pwf input { flex: 1; min-width: 0; padding-right: 38px; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 7px; padding-top: 8px; padding-bottom: 8px; padding-left: 9px; font: inherit; font-size: 13px; }
  .eye { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: 0; padding: 4px; color: var(--muted); cursor: pointer; display: flex; }
  .eye[aria-pressed='true'] { color: var(--accent); }
  .eye svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
</style>
