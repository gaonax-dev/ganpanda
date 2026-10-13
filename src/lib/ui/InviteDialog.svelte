<!-- 초대 링크 만들기·관리 (소유자) -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { createInvite, listInvites, revokeInvite, ROLE_LABEL, type InviteInfo } from '../projects';

  let role = $state<'viewer' | 'editor'>('viewer');
  let url = $state('');
  let copied = $state(false);
  let invites = $state<InviteInfo[]>([]);
  const room = app.room!;

  const refresh = () => listInvites(room).then((l) => (invites = l));
  $effect(() => { refresh(); });

  async function create() {
    const r = await createInvite(room, role);
    url = r.url;
    copied = false;
    await refresh();
  }
  async function copy() {
    await navigator.clipboard.writeText(url);
    copied = true;
  }
  const date = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
</script>

<div class="backdrop" role="presentation" onpointerdown={(e) => { if (e.target === e.currentTarget) app.inviteOpen = false; }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="초대 링크">
    <header><h2>초대 링크</h2><button class="icon" title="닫기" onclick={() => (app.inviteOpen = false)}>✕</button></header>

    <div class="roles">
      <label class:on={role === 'viewer'}><input type="radio" data-testid="invite-role-viewer" bind:group={role} value="viewer" />
        <b>보기·대화만</b><span>고객용. 사진과 사인물을 보고 대화·코멘트만 할 수 있습니다.</span></label>
      <label class:on={role === 'editor'}><input type="radio" data-testid="invite-role-editor" bind:group={role} value="editor" />
        <b>편집 가능</b><span>함께 작업하는 직원·디자이너용. 모든 편집이 가능합니다.</span></label>
    </div>
    <button class="btn primary" data-testid="invite-create" onclick={create}>링크 만들기</button>

    {#if url}
      <div class="url">
        <input data-testid="invite-url" readonly value={url} onfocus={(e) => e.currentTarget.select()} />
        <button class="btn small" onclick={copy}>{copied ? '복사됨 ✓' : '복사'}</button>
      </div>
      <p class="hint">링크를 받은 사람은 로그인 없이 이름만 정하고 들어옵니다. 폐기하면 즉시 쓸 수 없게 됩니다.</p>
    {/if}

    {#if invites.length}
      <h3>만든 링크</h3>
      <ul>
        {#each invites as inv (inv.id)}
          <li data-testid="invite-item" class:revoked={inv.revoked}>
            <span>{ROLE_LABEL[inv.role]} · {date(inv.createdAt)}</span>
            {#if inv.revoked}<small>폐기됨</small>
            {:else}<button class="btn small danger" data-testid="invite-revoke" onclick={() => revokeInvite(room, inv.id).then(refresh)}>폐기</button>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; z-index: 60; }
  .dialog { width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px 18px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; gap: 12px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 16px; }
  h3 { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
  .roles { display: flex; flex-direction: column; gap: 6px; }
  .roles label { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; color: var(--text); }
  .roles label.on { border-color: var(--accent); }
  .roles input { grid-row: span 2; }
  .roles span { font-size: 12px; color: var(--muted); }
  .url { display: flex; gap: 6px; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  li { display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding: 6px 0; border-bottom: 1px solid var(--line); }
  li.revoked { color: var(--muted); }
</style>
