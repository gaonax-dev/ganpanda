<!-- 오브젝트별 대화창 (카톡형) + 코멘트 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { Message } from '../core/model';

  let { objectId }: { objectId: string } = $props();
  let text = $state('');
  let kind = $state<Message['kind']>('chat');
  let list: HTMLDivElement;

  const messages = $derived.by(() => (app.version, app.project.messagesOf(objectId)));
  const shown = $derived(messages.filter((m) => m.kind === kind));
  const counts = $derived({ chat: messages.filter((m) => m.kind === 'chat').length, comment: messages.filter((m) => m.kind === 'comment').length });

  $effect(() => {
    shown.length;
    queueMicrotask(() => list?.scrollTo({ top: list.scrollHeight }));
  });

  function send() {
    const t = text.trim();
    if (!t) return;
    let name = app.nickname;
    if (!name) {
      name = prompt('대화에 표시할 이름을 입력하세요', '') ?? '';
      if (!name.trim()) return;
      app.setNickname(name.trim());
    }
    text = '';
    app.sendMessage(objectId, t, kind).catch(() => { text = t; });
  }

  const time = (ts: number) => new Date(ts).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
</script>

<div class="tabs">
  <button class:on={kind === 'chat'} onclick={() => (kind = 'chat')}>대화 {counts.chat || ''}</button>
  <button class:on={kind === 'comment'} onclick={() => (kind = 'comment')}>코멘트 {counts.comment || ''}</button>
</div>
<div class="list" class:comments={kind === 'comment'} bind:this={list}>
  {#each shown as m, i (m.id)}
    {@const mine = m.author === app.nickname}
    {@const head = i === 0 || shown[i - 1].author !== m.author}
    {#if kind === 'chat'}
      <div class="row" class:mine>
        {#if head && !mine}<div class="who">{m.author}</div>{/if}
        <div class="line">
          <div class="bubble" class:mine data-testid="chat-bubble">{m.text}</div>
          <span class="t">{time(m.ts)}</span>
        </div>
      </div>
    {:else}
      <div class="note" data-testid="comment-note"><b>{m.author}</b> <span class="t">{time(m.ts)}</span><p>{m.text}</p></div>
    {/if}
  {:else}
    <p class="none">{kind === 'chat' ? '이 사인물에 대해 대화를 시작하세요.' : '검토 코멘트를 남기세요.'}</p>
  {/each}
</div>
<form class="input" onsubmit={(e) => { e.preventDefault(); send(); }}>
  <textarea
    data-testid="chat-input"
    rows="1"
    placeholder={kind === 'chat' ? '메시지 입력' : '코멘트 입력'}
    bind:value={text}
    onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } }}
  ></textarea>
  <button type="submit" disabled={!text.trim()}>전송</button>
</form>

<style>
  .tabs { display: flex; border-bottom: 1px solid var(--line); }
  .tabs button { flex: 1; background: none; border: 0; color: var(--muted); padding: 9px; font: inherit; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; }
  .tabs button.on { color: var(--text); border-bottom-color: var(--accent); }
  .list { flex: 1; overflow-y: auto; padding: 10px 12px; background: var(--chat-bg); display: flex; flex-direction: column; gap: 4px; }
  .list.comments { background: var(--panel); }
  .row { display: flex; flex-direction: column; align-items: flex-start; }
  .row.mine { align-items: flex-end; }
  .who { font-size: 11px; color: var(--chat-who); margin: 6px 0 3px 2px; }
  .line { display: flex; align-items: flex-end; gap: 5px; max-width: 85%; }
  .row.mine .line { flex-direction: row-reverse; }
  .bubble { background: #fff; color: #191919; padding: 7px 10px; border-radius: 4px 14px 14px 14px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
  .bubble.mine { background: #fee500; border-radius: 14px 4px 14px 14px; }
  .t { font-size: 10px; color: var(--chat-who); white-space: nowrap; }
  .note { background: var(--input); border-left: 3px solid var(--accent); border-radius: 6px; padding: 6px 9px; font-size: 12px; }
  .note p { margin: 3px 0 0; white-space: pre-wrap; }
  .note .t { color: var(--muted); }
  .none { color: var(--chat-who); font-size: 12px; text-align: center; margin: auto; }
  .input { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--line); }
  textarea { flex: 1; resize: none; background: var(--input); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px; }
  .input button { background: #fee500; color: #191919; border: 0; border-radius: 8px; padding: 0 12px; font: inherit; font-weight: 700; cursor: pointer; }
  .input button:disabled { opacity: 0.4; cursor: default; }
</style>
