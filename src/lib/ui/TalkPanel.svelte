<!--
  톡 (2026-10-22 사용자: "톡은 메인화면의 상단에 톡버튼 … 프로젝트에서 대화 대상을 선택하고 대화방 이름을 지정하고 생성한다 …
  대화창을 1/3 정도에서 조금 크게 자리잡게하고 프로젝트를 네비게이션하고 선택한다. 기본으로 회사 맴버 톡방이 있다")
  · 데스크톱은 오른쪽 약 38%, 휴대폰은 아래 약 42% — 나머지 화면에서 보드를 옮기고 사인물을 고른다
  · 방이 열린 채 사인물을 고르면 / 사진 빈 곳을 탭하면 / 📍 로 위치를 찍으면 보낼 링크로 붙는다
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { listTeam } from '../projects';
  import { memberLabel, roomKey } from '../core/talk';
  import type { TalkRoom } from '../core/model';
  import Chat from './Chat.svelte';

  let creating = $state(false);
  let name = $state('');
  /** 고른 아이디 */
  let picked = $state<string[]>([]);
  let team = $state<{ id: string; name: string }[]>([]);

  const room = $derived(app.talkRooms.find((r) => r.id === app.talkRoomId) ?? null);
  const unread = $derived(app.talkUnreadInfo.byRoom);
  /** 대화 상대 후보 (아이디로 연결, 화면은 닉네임 — 2026-10-22): 지금 접속한 사람·이 프로젝트에서 대화한 사람 + 내 팀 멤버 */
  const candidates = $derived.by(() => {
    const by = new Map<string, string>();
    for (const t of team) by.set(t.id, t.name);
    for (const [id, name] of Object.entries(app.talkNames)) by.set(id, name);
    by.delete(app.myId);
    return [...by.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  });
  /** 방 사람들 (나 빼고) 이름 */
  const people = (r: TalkRoom) => [r.createdById, ...r.memberIds].filter((id) => id && id !== app.myId).map((id) => memberLabel(r, id, app.talkNames)).join(', ');

  $effect(() => {
    if (!creating || !app.account) return;
    listTeam().then((ms) => (team = ms.map((m) => ({ id: m.accountId, name: m.name || m.email.split('@')[0] })))).catch(() => {});
  });

  // 열린 방의 새 메시지는 읽은 것으로
  $effect(() => {
    const id = app.talkRoomId;
    void app.messages.length;
    if (id) app.markSeen(roomKey(id));
  });

  function create() {
    if (app.createTalk(name, candidates.filter((c) => picked.includes(c.id)))) { creating = false; name = ''; picked = []; }
  }
  const toggle = (id: string) => (picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
</script>

<aside class="talk" data-testid="talk-panel">
  <header>
    {#if room || creating}<button class="back" data-testid="talk-back" title="방 목록" onclick={() => { creating = false; app.talkRoomId = null; app.talkRefs = []; }}>←</button>{/if}
    <b data-testid="talk-title">{creating ? '새 톡방' : room ? room.name : '톡'}</b>
    {#if room && room.id !== 'team'}<span class="who" title={people(room)}>{people(room)}</span>{/if}
    <span class="sp"></span>
    {#if room}<button class="pin" data-testid="talk-pin" class:on={app.tool === 'pin'} title="📍 사진에 번호를 찍어 링크로" onclick={() => (app.tool = app.tool === 'pin' ? 'select' : 'pin')}>📍</button>{/if}
    <button class="x" data-testid="talk-close" title="닫기" onclick={() => app.closeTalk()}>✕</button>
  </header>

  {#if creating}
    <form class="new" onsubmit={(e) => { e.preventDefault(); create(); }}>
      <label>방 이름<input data-testid="talk-new-name" bind:value={name} maxlength="40" placeholder="예: 고객 상담, 시공팀" /></label>
      <div class="lbl">대화 상대</div>
      <div class="cands">
        {#each candidates as c (c.id)}
          <label class="cand"><input type="checkbox" data-testid="talk-member" value={c.name} data-id={c.id} checked={picked.includes(c.id)} onchange={() => toggle(c.id)} /> {c.name}</label>
        {:else}
          <p class="hint">아직 고를 사람이 없습니다.</p>
        {/each}
      </div>
      <p class="hint">목록에 없는 사람은 초대 링크로 이 프로젝트에 한 번 들어오면 나옵니다. 이름을 바꿔도 아이디로 이어져 방에 남습니다.</p>
      <button type="submit" class="primary" data-testid="talk-create" disabled={!name.trim()}>만들기</button>
    </form>
  {:else if room}
    <div class="chat">{#key room.id}<Chat objectId={roomKey(room.id)} talk />{/key}</div>
  {:else}
    <ul class="rooms">
      {#each app.talkRooms as r (r.id)}
        <li><button data-testid="talk-room" data-id={r.id} onclick={() => app.openTalk(r.id)}>
          <span class="nm">{r.id === 'team' ? '🏢 ' : '💬 '}{r.name}</span>
          <span class="mem">{r.id === 'team' ? '편집 권한이 있는 회사 사람 모두' : people(r)}</span>
          {#if unread[r.id]}<span class="badge" data-testid="talk-room-unread">{unread[r.id]}</span>{/if}
        </button></li>
      {:else}
        <li class="hint">아직 초대된 톡방이 없습니다.</li>
      {/each}
    </ul>
    {#if app.isCompany}<button class="primary add" data-testid="talk-new" onclick={() => (creating = true)}>+ 새 톡방</button>{/if}
  {/if}
</aside>

<style>
  .talk { position: fixed; top: var(--talk-top, 52px); right: 0; bottom: 0; width: max(340px, 38vw); z-index: 30; display: flex; flex-direction: column; background: var(--panel); border-left: 1px solid var(--line); box-shadow: -6px 0 18px rgba(0, 0, 0, 0.25); }
  header { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--line); min-height: 40px; }
  header b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .sp { flex: 1; }
  header button { background: none; border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 3px 9px; font: inherit; cursor: pointer; }
  header .pin.on { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
  .chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .rooms { list-style: none; margin: 0; padding: 6px; overflow-y: auto; flex: 1; }
  .rooms button { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; text-align: left; background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 10px; padding: 9px 11px; margin-bottom: 6px; font: inherit; cursor: pointer; }
  .nm { font-weight: 700; }
  .mem { grid-column: 1; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badge { grid-row: 1 / span 2; grid-column: 2; align-self: center; background: var(--accent); color: var(--accent-ink); border-radius: 10px; padding: 1px 8px; font-size: 12px; font-weight: 800; }
  .primary { background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 8px; padding: 9px 12px; font: inherit; font-weight: 700; cursor: pointer; }
  .primary:disabled { opacity: 0.5; cursor: default; }
  .add { margin: 8px; }
  .new { display: flex; flex-direction: column; gap: 10px; padding: 12px; overflow-y: auto; }
  .new label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
  .new input:not([type='checkbox']) { background: var(--input); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 8px; font: inherit; }
  .lbl { font-size: 13px; color: var(--muted); }
  .cands { display: flex; flex-wrap: wrap; gap: 6px 12px; }
  .new .cand { flex-direction: row; align-items: center; gap: 5px; color: var(--text); }
  .hint { color: var(--muted); font-size: 12px; margin: 0; padding: 6px; }
  @media (max-width: 720px) {
    .talk { top: auto; left: 0; width: auto; height: 42vh; border-left: 0; border-top: 1px solid var(--line); box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.25); }
  }
</style>
