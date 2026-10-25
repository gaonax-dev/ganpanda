<!-- 앱 안 확인·입력 창 (2026-10-25) — ask.svelte.ts 가 연다. 바깥을 눌러도 닫지 않는다(입력 창 규칙), Esc = 취소, Enter = 확인 -->
<script lang="ts">
  import { ask, answer } from './ask.svelte';
  let value = $state('');
  let input = $state<HTMLInputElement | null>(null);
  $effect(() => {
    const c = ask.current;
    if (c?.kind === 'prompt') { value = c.value; queueMicrotask(() => { input?.focus(); input?.select(); }); }
  });
  const ok = () => answer(ask.current?.kind === 'prompt' ? value : true);
  const cancel = () => answer(ask.current?.kind === 'prompt' ? null : false);
</script>

{#if ask.current}
  <div class="backdrop" role="presentation" onkeydown={(e) => { if (e.key === 'Escape') cancel(); }}>
    <div class="dialog" role="dialog" aria-modal="true" data-testid="ask-dialog" data-kind={ask.current.kind}>
      <p class="msg" data-testid="ask-message">{ask.current.message}</p>
      {#if ask.current.kind === 'prompt'}
        <input data-testid="ask-input" bind:this={input} bind:value onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }} />
      {/if}
      <div class="row">
        <button class="btn" data-testid="ask-cancel" onclick={cancel}>취소</button>
        <button class="btn primary" data-testid="ask-ok" onclick={ok}>확인</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); display: grid; place-items: center; z-index: 100; }
  .dialog { width: min(360px, calc(100vw - 32px)); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; gap: 14px; }
  .msg { margin: 0; font-size: 14px; line-height: 1.55; white-space: pre-line; }
  input { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 9px 10px; font: inherit; font-size: 16px; }
  .row { display: flex; justify-content: flex-end; gap: 8px; }
  .row .btn { min-height: 40px; padding: 0 16px; }
</style>
