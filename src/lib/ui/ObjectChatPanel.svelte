<!-- 사인물 말풍선 창 (2026-10-18 사용자: "속성 패널에서 대화 섹션 빼줘"): 속성 패널의 대화 섹션을 대신한다. 말풍선(💬)을 누르거나 패널·빠른 막대의 💬 로 연다 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { SignObject } from '../core/model';
  import Chat from './Chat.svelte';

  let { obj }: { obj: SignObject } = $props();
  const chatId = $derived(obj.sameAs ?? obj.id);
  // 창이 열려 있는 동안 이 사인물의 새 메시지는 읽은 것으로
  $effect(() => { app.messages; app.markSeen(chatId); });
</script>

<aside class="panel" data-testid="object-chat">
  <header>
    <span class="icon-bubble">💬</span>
    <div class="meta">
      <b>말풍선 · {obj.name}</b>
      <small>이 사인물에 대한 대화{obj.sameAs ? ' (연결된 사인물과 같은 대화)' : ''}</small>
    </div>
    <button class="icon" title="닫기" data-testid="object-chat-close" onclick={() => app.closeChat()}>✕</button>
  </header>
  <section class="chat-sec">
    <Chat objectId={chatId} />
  </section>
</aside>

<style>
  .panel {
    position: absolute; top: 12px; right: 12px; bottom: 12px; width: 330px; z-index: 5;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .icon-bubble { width: 28px; height: 28px; border-radius: 50%; background: var(--accent); display: grid; place-items: center; font-size: 14px; }
  .meta { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .meta b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta small { color: var(--muted); font-size: 11px; }
  .chat-sec { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  @media (max-width: 720px) { .panel { left: 8px; right: 8px; top: auto; bottom: 8px; width: auto; height: min(70vh, 520px); } }
</style>
