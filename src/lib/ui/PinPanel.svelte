<!-- 말풍선(위치 코멘트) 패널: 받는 사람·작성자·해결·삭제 + 대화 (2026-10-17 "핀을 말 풍선으로, 받는 사람이 있다. 모두가 보게 할 수도 있다") -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { Pin } from '../core/model';
  import Chat from './Chat.svelte';
  import { EVERYONE, recipientLabel } from '../core/pins';
  import { objectAtPoint } from '../core/bubbleTarget';

  let { pin }: { pin: Pin } = $props();
  const photo = $derived(app.photos.find((p) => p.id === pin.photoId));
  /** 말풍선의 소유주 = 작성자 (프로젝트 소유자도 가능): 완료·삭제는 소유주만 (2026-10-18 "말풍선은 작성자가 소유주이다") */
  const owns = $derived(app.canEdit && (pin.author === app.nickname || app.role === 'owner'));
  /** 꼭지가 가리키는 사인물 (2026-10-18 "꼭지점 위치의 사인물을 최대한 추적") */
  const target = $derived(objectAtPoint(app.objects, pin.photoId, [pin.x, pin.y]));
  /** 받는 사람 후보: 참여자 + 지금 값(목록에 없더라도) */
  const recipients = $derived(pin.to && !app.participants.includes(pin.to) ? [pin.to, ...app.participants] : app.participants);
  const setTo = (v: string) => { app.editBoundary(); app.project.updatePin(pin.id, { to: v || undefined }); app.editBoundary(); };
  const date = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  // 패널이 열려 있는 동안 이 핀의 새 메시지는 읽은 것으로
  $effect(() => { app.messages; app.markSeen(pin.id); });
</script>

<aside class="panel" data-testid="pin-panel">
  <header>
    <span class="num">#{pin.number}</span>
    <div class="meta">
      <b>말풍선</b>
      <small>{pin.author} → <span data-testid="pin-to-label">{recipientLabel(pin)}</span> · {date(pin.createdAt)}{#if photo} · {photo.name}{/if}</small>
    </div>
    <button class="icon" title="닫기" onclick={() => app.selectPin(null)}>✕</button>
  </header>
  {#if target}
    <div class="actions">
      <span class="muted">꼭지가 가리키는 사인물</span>
      <button class="btn small" data-testid="pin-goto-object" title="그 사인물의 속성으로" onclick={() => { app.selectObject(target.id); if (app.compact) app.panelOpen = true; }}>📐 {target.name} 속성</button>
    </div>
  {/if}
  {#if app.canEdit}
    <label class="to">받는 사람
      <select data-testid="pin-to" value={pin.to ?? EVERYONE} onchange={(e) => setTo(e.currentTarget.value)}>
        <option value={EVERYONE}>모두</option>
        {#each recipients as n (n)}<option value={n}>{n}</option>{/each}
      </select>
      <small>{pin.to ? '보낸 사람·받는 사람·소유자만 봅니다' : '프로젝트의 모두가 봅니다'}</small>
    </label>
    {#if owns}
    <div class="actions">
      <!-- 완료: 화면에서 말풍선이 사라지고 사인물 속성의 컨펌 리스트(사인물을 안 가리키면 사진 머리의 ✓ 완료)에 남는다 -->
      <button class="btn small" class:on={pin.resolved} data-testid="pin-resolve" title={pin.resolved ? '다시 열면 화면에 말풍선이 돌아옵니다' : '완료하면 화면에서 사라지고 컨펌 리스트에 남습니다'} onclick={() => { app.editBoundary(); app.project.updatePin(pin.id, { resolved: !pin.resolved }); app.editBoundary(); }}>
        {pin.resolved ? '✓ 완료됨 · 다시 열기' : '완료'}
      </button>
      <button class="btn small danger" data-testid="pin-delete" onclick={() => { app.editBoundary(); app.project.removePin(pin.id); app.editBoundary(); app.selectPin(null); }}>삭제</button>
    </div>
    {:else if pin.resolved}
    <div class="actions"><span class="resolved">✓ 완료됨</span><span class="muted">완료·삭제는 작성자({pin.author})나 소유자만</span></div>
    {:else}
    <div class="actions"><span class="muted">완료·삭제는 작성자({pin.author})나 소유자만</span></div>
    {/if}
  {:else if pin.resolved}
    <div class="actions"><span class="resolved">✓ 완료됨</span></div>
  {/if}
  <section class="chat-sec">
    <Chat objectId={pin.id} />
  </section>
</aside>

<style>
  .panel {
    position: absolute; top: 12px; right: 12px; bottom: 12px; width: 330px; z-index: 5;
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .num { width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 800; font-size: 12px; }
  .meta { flex: 1; display: flex; flex-direction: column; }
  .meta small { color: var(--muted); font-size: 11px; }
  .actions { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--line); }
  .to { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  .to select { font: inherit; }
  .to small { flex-basis: 100%; font-size: 11px; }
  .btn.on { border-color: var(--ok); color: var(--ok); }
  .resolved { color: var(--ok); font-size: 12px; }
  .muted { color: var(--muted); font-size: 11px; align-self: center; }
  .chat-sec { flex: 1; display: flex; flex-direction: column; min-height: 0; }
</style>
