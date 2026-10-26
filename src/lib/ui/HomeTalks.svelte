<!--
  메인 화면 톡 (2026-10-22 사용자: "메인화면에서 모든 톡방을 열어서 확인하고 링크를 누르면 해당 프로젝트의 링크로 이동하는거 맞지?")
  · 내가 멤버(계정 아이디)인 모든 프로젝트의 톡방 — 서버 톡 색인(/api/me/talks), 최근 대화 순
  · 방을 누르면 여기서 읽고 답한다. 링크(사인물·사진·번호)를 누르면 그 프로젝트로 가서 방을 열고 그 대상을 화면에 잡는다
  · 홈 본문의 칸이 아니라 헤더 [톡] 을 누르면 열리는 목록 창 (2026-10-25 "메인화면에 톡을 헤더로 이동시키고 누르면 톡 목록으로") — 상태는 homeTalkList.svelte.ts
  · 하단 탭 [사용자 | 톡] (2026-10-26 "톡 하단에 사용자, 톡으로 탭바, 사용자에 맴버, 요청, 고객 배지, 톡방에는 프로젝트 배지와 고객 배지(고객이 대화방에 있는곳)"):
    사용자 = 같은 회사 멤버·견적 요청 고객·톡방 고객(배지), 누르면 톡 탭에 그 사람이 있는 방만. 톡방 = 프로젝트 배지 + 고객이 있으면 고객 배지
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { homeTalks } from './homeTalkList.svelte';
  import { readTalk, sendTalkFromHome, type Person, type PersonBadge, type TalkSummary } from '../projects';
  import { refLabel } from '../core/talk';
  import { maskProfanity } from '../core/profanity';
  import type { Message, TalkRef } from '../core/model';

  let open = $state<TalkSummary | null>(null);
  let messages = $state<Message[]>([]);
  let text = $state('');
  let sending = $state(false);

  $effect(() => { if (app.account) void homeTalks.load(); else homeTalks.reset(); });

  async function show(t: TalkSummary) {
    open = t;
    messages = [];
    try { messages = await readTalk(t.projectId, t.roomId); } catch { messages = []; }
    const last = messages.at(-1)?.ts ?? t.last?.ts ?? 0;
    homeTalks.markSeen(t, last);
  }
  async function send() {
    if (!open || !text.trim() || sending) return;
    sending = true;
    try { await sendTalkFromHome(open.projectId, open.roomId, maskProfanity(text.trim())); text = ''; await show(open); void homeTalks.load(); } finally { sending = false; }
  }
  const goto = (t: TalkSummary, r?: TalkRef) => (location.href = `/?room=${encodeURIComponent(t.projectId)}&talk=${encodeURIComponent(t.roomId)}${r ? `&focus=${r.kind}:${encodeURIComponent(r.id)}` : ''}`);
  const time = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const close = () => { homeTalks.open = false; open = null; };
  const BADGE: Record<PersonBadge, string> = { member: '멤버', request: '요청', customer: '고객' };
  $effect(() => { if (homeTalks.open && homeTalks.tab === 'people' && !homeTalks.peopleLoaded) void homeTalks.loadPeople(); });
  function pick(p: Person) { homeTalks.person = p; homeTalks.tab = 'talks'; open = null; }
</script>

{#if homeTalks.open}
  <section class="talks" data-testid="home-talks" class:split={!!open}>
    <header class="bar">
      <h1>톡 <small>{homeTalks.newCount ? `새 대화 ${homeTalks.newCount}` : ''}</small></h1>
      <button class="x" data-testid="home-talks-close" title="닫기" onclick={close}>✕</button>
    </header>
    <div class="wrap" class:split={!!open}>
      {#if homeTalks.tab === 'people'}
      <ul data-testid="home-people">
        {#each homeTalks.people.filter((x) => !app.blocks.some((b) => b.id === x.id)) as p (p.id)}
          <li><button class="person" data-testid="home-person" onclick={() => pick(p)}>
            <b>{p.name}</b>
            <span class="badges">{#each p.badges as b (b)}<i class="badge {b}" data-testid="home-person-badge">{BADGE[b]}</i>{/each}</span>
          </button></li>
        {:else}
          <li class="hint">{homeTalks.peopleLoaded ? '아직 함께하는 사람이 없습니다. 설정에서 멤버를 초대하거나 프로젝트 톡방에 고객을 넣으면 여기에 모입니다.' : '불러오는 중…'}</li>
        {/each}
      </ul>
      {:else}
      <ul>
        {#if homeTalks.person}<li class="filter" data-testid="home-talk-filter">{homeTalks.person.name}님이 있는 방<button class="clear" data-testid="home-talk-filter-clear" title="모든 방" onclick={() => (homeTalks.person = null)}>✕</button></li>{/if}
        {#each homeTalks.shown as t (t.projectId + t.roomId)}
          <li><button class:on={open?.projectId === t.projectId && open?.roomId === t.roomId} data-testid="home-talk" data-room={t.roomId} onclick={() => show(t)}>
            <span class="badges top"><i class="badge project" data-testid="home-talk-project">{t.projectName}</i>{#if t.customer}<i class="badge customer" data-testid="home-talk-customer">고객</i>{/if}</span>
            <b>{t.roomId === 'team' ? '🏢' : '💬'} {t.roomName}</b>
            {#if homeTalks.isNew(t)}<i class="dot" data-testid="home-talk-new">새</i>{/if}
            {#if t.last}<span class="last">{t.last.author}: {t.last.text}</span>{/if}
          </button></li>
        {:else}
          <li class="hint">{homeTalks.loaded ? (homeTalks.person ? '이 사람과 함께 있는 방이 없습니다.' : '아직 톡방이 없습니다. 프로젝트 안의 [톡]에서 방을 만들면 여기에 모입니다.') : '불러오는 중…'}</li>
        {/each}
      </ul>
      {/if}
      {#if open}
        <div class="room" data-testid="home-talk-room">
          <header>
            <button class="back" title="목록으로" onclick={() => (open = null)}>←</button>
            <b>{open.projectName} · {open.roomName}</b>
            <button class="go" data-testid="home-talk-open-project" onclick={() => goto(open!)}>프로젝트에서 열기 →</button>
          </header>
          <div class="list">
            {#each messages.filter((x) => !app.isBlocked(x)) as m (m.id)}
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
    <nav class="tabs" data-testid="home-talks-tabs">
      <button class:on={homeTalks.tab === 'people'} data-testid="home-tab-people" onclick={() => { homeTalks.tab = 'people'; open = null; }}>👥 사용자</button>
      <button class:on={homeTalks.tab === 'talks'} data-testid="home-tab-talks" onclick={() => (homeTalks.tab = 'talks')}>💬 톡{#if homeTalks.newCount}<i class="n">{homeTalks.newCount}</i>{/if}</button>
    </nav>
  </section>
{/if}

<style>
  /* 헤더 아래 오른쪽에 붙는 목록 창 — 휴대폰은 전체 폭 */
  .talks { position: fixed; top: calc(52px + env(safe-area-inset-top, 0px)); right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); width: min(420px, calc(100vw - 16px)); z-index: 40; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45); overflow: hidden; }
  .talks.split { width: min(820px, calc(100vw - 16px)); }
  .bar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .bar h1 { flex: 1; margin: 0; font-size: 16px; }
  h1 small { font-size: 13px; color: var(--accent); margin-left: 6px; }
  .x, .back { background: none; border: 1px solid var(--line); color: var(--text); border-radius: 8px; min-width: 32px; min-height: 32px; font: inherit; cursor: pointer; }
  .wrap { flex: 1; min-height: 0; display: grid; gap: 10px; padding: 10px; }
  .wrap.split { grid-template-columns: minmax(200px, 1fr) 2fr; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto; }
  li.hint { color: var(--muted); font-size: 13px; padding: 8px 4px; }
  li button { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; text-align: left; background: var(--bg); border: 1px solid var(--line); color: var(--text); border-radius: 10px; padding: 10px 12px; font: inherit; cursor: pointer; }
  li button.on { border-color: var(--accent); }
  .badges { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .badges.top { grid-column: 1 / -1; }
  .badge { font-style: normal; font-size: 11px; font-weight: 700; border-radius: 9px; padding: 1px 8px; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .badge.project { background: color-mix(in srgb, var(--text) 10%, transparent); color: var(--text); }
  .badge.member { background: color-mix(in srgb, #3b82f6 22%, transparent); color: #93c5fd; }
  .badge.request { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); }
  .badge.customer { background: color-mix(in srgb, #22c55e 22%, transparent); color: #86efac; }
  li button.person { grid-template-columns: 1fr auto; align-items: center; }
  li.filter { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--accent); padding: 4px 4px 4px 8px; }
  li.filter .clear { background: none; border: 1px solid var(--line); color: var(--text); border-radius: 8px; min-width: 28px; min-height: 28px; font: inherit; cursor: pointer; }
  /* 하단 탭 막대 */
  .tabs { display: flex; border-top: 1px solid var(--line); padding: 4px 6px calc(4px + env(safe-area-inset-bottom, 0px)); gap: 4px; }
  .tabs button { flex: 1; background: none; border: 0; border-radius: 10px; color: var(--muted); font: inherit; font-size: 14px; font-weight: 700; padding: 10px 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .tabs button.on { color: var(--text); background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .tabs .n { font-style: normal; background: #ef4444; color: #fff; border-radius: 9px; padding: 0 6px; font-size: 11px; }
  .dot { font-style: normal; background: #ef4444; color: #fff; border-radius: 9px; padding: 0 7px; font-size: 11px; font-weight: 800; align-self: center; }
  .last { grid-column: 1 / -1; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .room { display: flex; flex-direction: column; min-height: 0; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; }
  .room header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .room header b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .room header .go { background: none; border: 1px solid var(--accent); color: var(--accent); font-weight: 700; border-radius: 8px; padding: 3px 9px; font: inherit; font-size: 12px; cursor: pointer; }
  .room header .back { display: none; }
  .list { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: var(--chat-bg); }
  .msg { align-self: flex-start; max-width: 85%; background: #fff; color: #191919; border-radius: 4px 12px 12px 12px; padding: 6px 10px; }
  .msg.mine { align-self: flex-end; background: #fee500; border-radius: 12px 4px 12px 12px; }
  .msg p { margin: 2px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; }
  .who { font-size: 11px; color: #666; }
  .refs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .ref { background: rgba(0, 0, 0, 0.08); border: 1px solid rgba(0, 0, 0, 0.18); color: #1d4ed8; border-radius: 10px; padding: 2px 8px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  form { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--line); }
  form input { flex: 1; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 8px; font: inherit; font-size: 16px; }
  form button { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 8px; padding: 0 14px; font: inherit; font-weight: 700; cursor: pointer; }
  form button:disabled { opacity: 0.5; }
  .hint { color: var(--muted); font-size: 12px; }
  /* 휴대폰: 목록 ↔ 방 한 칸씩, 방에서 [←] 로 목록 */
  @media (max-width: 720px) {
    .talks, .talks.split { right: 0; left: 0; width: auto; bottom: 0; border-radius: 14px 14px 0 0; }
    .wrap.split { grid-template-columns: 1fr; }
    .wrap.split ul { display: none; }
    .room header .back { display: inline-block; }
  }
</style>
