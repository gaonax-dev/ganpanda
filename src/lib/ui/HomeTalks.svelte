<!--
  메인 화면 톡 (2026-10-22 사용자: "메인화면에서 모든 톡방을 열어서 확인하고 링크를 누르면 해당 프로젝트의 링크로 이동하는거 맞지?")
  · 내가 멤버(계정 아이디)인 모든 프로젝트의 톡방 — 서버 톡 색인(/api/me/talks), 최근 대화 순
  · 방을 누르면 여기서 읽고 답한다. 링크(사인물·사진·번호)를 누르면 그 프로젝트로 가서 방을 열고 그 대상을 화면에 잡는다
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { listMyTalks, readTalk, sendTalkFromHome, type TalkSummary } from '../projects';
  import { refLabel } from '../core/talk';
  import type { Message, TalkRef } from '../core/model';

  let talks = $state<TalkSummary[]>([]);
  let open = $state<TalkSummary | null>(null);
  let messages = $state<Message[]>([]);
  let text = $state('');
  let sending = $state(false);

  const seenKey = (t: TalkSummary) => `ganpanda.seen.${t.projectId}`;
  function seenOf(t: TalkSummary): number {
    try { return (JSON.parse(localStorage.getItem(seenKey(t)) ?? '{}') as Record<string, number>)[`talk:${t.roomId}`] ?? 0; } catch { return 0; }
  }
  function markSeen(t: TalkSummary, ts: number) {
    try { const m = JSON.parse(localStorage.getItem(seenKey(t)) ?? '{}') as Record<string, number>; if ((m[`talk:${t.roomId}`] ?? 0) < ts) { m[`talk:${t.roomId}`] = ts; localStorage.setItem(seenKey(t), JSON.stringify(m)); } } catch { /* 저장 불가 */ }
  }
  let seenTick = $state(0);
  const isNew = (t: TalkSummary) => (void seenTick, !!t.last && t.last.author !== app.nickname && t.last.ts > seenOf(t));

  async function load() { try { talks = await listMyTalks(); } catch { talks = []; } }
  $effect(() => { if (app.account) void load(); });

  async function show(t: TalkSummary) {
    open = t;
    messages = [];
    try { messages = await readTalk(t.projectId, t.roomId); } catch { messages = []; }
    const last = messages.at(-1)?.ts ?? t.last?.ts ?? 0;
    markSeen(t, last); seenTick++;
  }
  async function send() {
    if (!open || !text.trim() || sending) return;
    sending = true;
    try { await sendTalkFromHome(open.projectId, open.roomId, text.trim()); text = ''; await show(open); void load(); } finally { sending = false; }
  }
  const goto = (t: TalkSummary, r?: TalkRef) => (location.href = `/?room=${encodeURIComponent(t.projectId)}&talk=${encodeURIComponent(t.roomId)}${r ? `&focus=${r.kind}:${encodeURIComponent(r.id)}` : ''}`);
  const time = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

{#if talks.length}
  <section class="talks" data-testid="home-talks">
    <h1>톡 <small>{talks.filter(isNew).length ? `새 대화 ${talks.filter(isNew).length}` : ''}</small></h1>
    <div class="wrap" class:split={!!open}>
      <ul>
        {#each talks as t (t.projectId + t.roomId)}
          <li><button class:on={open?.projectId === t.projectId && open?.roomId === t.roomId} data-testid="home-talk" data-room={t.roomId} onclick={() => show(t)}>
            <span class="pj">{t.projectName}</span>
            <b>{t.roomId === 'team' ? '🏢' : '💬'} {t.roomName}</b>
            {#if isNew(t)}<i class="dot" data-testid="home-talk-new">새</i>{/if}
            {#if t.last}<span class="last">{t.last.author}: {t.last.text}</span>{/if}
          </button></li>
        {/each}
      </ul>
      {#if open}
        <div class="room" data-testid="home-talk-room">
          <header>
            <b>{open.projectName} · {open.roomName}</b>
            <button class="go" data-testid="home-talk-open-project" onclick={() => goto(open!)}>프로젝트에서 열기 →</button>
            <button class="x" title="닫기" onclick={() => (open = null)}>✕</button>
          </header>
          <div class="list">
            {#each messages as m (m.id)}
              <div class="msg" class:mine={m.authorId ? m.authorId === app.myId : m.author === app.nickname}>
                <span class="who">{m.author} · {time(m.ts)}</span>
                {#if m.text}<p data-testid="home-talk-text">{m.text}</p>{/if}
                {#if m.refs?.length}<div class="refs">{#each m.refs as r (r.kind + r.id)}<button class="ref" data-testid="home-talk-ref" onclick={() => goto(open!, r)}>{refLabel(r)}</button>{/each}</div>{/if}
                {#if m.attachments?.length}<span class="who">첨부 {m.attachments.length}개 — 프로젝트에서 보기</span>{/if}
              </div>
            {:else}
              <p class="hint">아직 대화가 없습니다.</p>
            {/each}
          </div>
          <form onsubmit={(e) => { e.preventDefault(); void send(); }}>
            <input data-testid="home-talk-input" bind:value={text} placeholder="메시지 입력" />
            <button type="submit" data-testid="home-talk-send" disabled={!text.trim() || sending}>전송</button>
          </form>
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .talks { margin-bottom: 22px; }
  h1 small { font-size: 13px; color: var(--accent); margin-left: 6px; }
  .wrap { display: grid; gap: 12px; }
  .wrap.split { grid-template-columns: minmax(220px, 1fr) 2fr; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow-y: auto; }
  li button { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; text-align: left; background: var(--panel); border: 1px solid var(--line); color: var(--text); border-radius: 10px; padding: 9px 11px; font: inherit; cursor: pointer; }
  li button.on { border-color: var(--accent); }
  .pj { grid-column: 1 / -1; color: var(--muted); font-size: 12px; }
  .dot { font-style: normal; background: #ef4444; color: #fff; border-radius: 9px; padding: 0 7px; font-size: 11px; font-weight: 800; align-self: center; }
  .last { grid-column: 1 / -1; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .room { display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; min-height: 300px; max-height: 520px; }
  .room header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .room header b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .room header button { background: none; border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 3px 9px; font: inherit; font-size: 12px; cursor: pointer; }
  .room .go { border-color: var(--accent); color: var(--accent); font-weight: 700; }
  .list { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: var(--chat-bg); }
  .msg { align-self: flex-start; max-width: 85%; background: #fff; color: #191919; border-radius: 4px 12px 12px 12px; padding: 6px 10px; }
  .msg.mine { align-self: flex-end; background: #fee500; border-radius: 12px 4px 12px 12px; }
  .msg p { margin: 2px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; }
  .who { font-size: 11px; color: #666; }
  .refs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .ref { background: rgba(0, 0, 0, 0.08); border: 1px solid rgba(0, 0, 0, 0.18); color: #1d4ed8; border-radius: 10px; padding: 2px 8px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  form { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--line); }
  form input { flex: 1; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 8px; font: inherit; }
  form button { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 8px; padding: 0 14px; font: inherit; font-weight: 700; cursor: pointer; }
  form button:disabled { opacity: 0.5; }
  .hint { color: var(--muted); font-size: 12px; }
  @media (max-width: 720px) { .wrap.split { grid-template-columns: 1fr; } }
</style>
