<!-- 오브젝트별 대화창 (카톡형) + 코멘트 -->
<script lang="ts">
  import { app } from '../state.svelte';
  import type { Attachment } from '../core/model';
  import { ATTACH_ACCEPT, ATTACH_MAX } from '../core/attachments';
  import { formatBytes } from '../core/format';
  import { putAsset, StorageLimitError } from '../assets';
  import AttachmentView from './AttachmentView.svelte';

  let { objectId }: { objectId: string } = $props();
  let text = $state('');
  let kind = $state<'chat' | 'comment'>('chat');
  let list: HTMLDivElement;
  /** 보내기 전 첨부 */
  let pending = $state<Attachment[]>([]);
  let uploading = $state(0);
  let attachError = $state('');

  async function addFiles(files: FileList | File[] | null | undefined) {
    if (!files) return;
    attachError = '';
    for (const f of [...files]) {
      if (pending.length + uploading >= ATTACH_MAX) { attachError = `첨부는 ${ATTACH_MAX}개까지입니다.`; break; }
      if (!(f.type.startsWith('image/') || f.type === 'application/pdf' || f.type.startsWith('audio/'))) { attachError = '사진·PDF·음성만 첨부할 수 있습니다.'; continue; }
      uploading++;
      try {
        const assetId = await putAsset(f);
        pending = [...pending, { assetId, name: f.name, type: f.type, size: f.size }];
      } catch (e) {
        attachError = e instanceof StorageLimitError ? `저장 용량 한도(${formatBytes(e.limitBytes)})를 넘어 첨부할 수 없습니다.` : '첨부에 실패했습니다.';
      } finally { uploading--; }
    }
  }

  const messages = $derived.by(() => (app.version, app.project.messagesOf(objectId)));
  const shown = $derived(messages.filter((m) => m.kind === kind));
  const counts = $derived({ chat: messages.filter((m) => m.kind === 'chat').length, comment: messages.filter((m) => m.kind === 'comment').length });

  $effect(() => {
    shown.length;
    queueMicrotask(() => list?.scrollTo({ top: list.scrollHeight }));
  });

  function send() {
    const t = text.trim();
    if ((!t && !pending.length) || uploading) return;
    let name = app.nickname;
    if (!name) {
      name = prompt('대화에 표시할 이름을 입력하세요', '') ?? '';
      if (!name.trim()) return;
      app.setNickname(name.trim());
    }
    const atts = pending;
    text = ''; pending = [];
    app.requestNotifyPermission();
    app.sendMessage(objectId, t, kind, atts).catch(() => { text = t; pending = atts; });
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
          <div class="bubble" class:mine data-testid="chat-bubble">
            {#if m.attachments?.length}<div class="atts">{#each m.attachments as a (a.assetId + a.name)}<AttachmentView att={a} />{/each}</div>{/if}
            {#if m.text}{m.text}{/if}
          </div>
          <span class="t">{time(m.ts)}</span>
        </div>
      </div>
    {:else}
      <div class="note" data-testid="comment-note"><b>{m.author}</b> <span class="t">{time(m.ts)}</span>
        {#if m.attachments?.length}<div class="atts">{#each m.attachments as a (a.assetId + a.name)}<AttachmentView att={a} />{/each}</div>{/if}
        {#if m.text}<p>{m.text}</p>{/if}</div>
    {/if}
  {:else}
    <p class="none">{kind === 'chat' ? '이 사인물에 대해 대화를 시작하세요.' : '검토 코멘트를 남기세요.'}</p>
  {/each}
</div>
{#if pending.length || uploading || attachError}
  <div class="pending">
    {#each pending as a (a.assetId + a.name)}
      <span class="chip" data-testid="chat-pending">{a.type.startsWith('image/') ? '🖼' : '📄'} {a.name}<button title="빼기" onclick={() => (pending = pending.filter((x) => x !== a))}>×</button></span>
    {/each}
    {#if uploading}<span class="chip">올리는 중…</span>{/if}
    {#if attachError}<span class="err">{attachError}</span>{/if}
  </div>
{/if}
<form class="input" onsubmit={(e) => { e.preventDefault(); send(); }}>
  <label class="attach" title="사진·PDF 첨부">📎<input data-testid="chat-attach" type="file" accept={ATTACH_ACCEPT} multiple hidden onchange={(e) => { addFiles(e.currentTarget.files); e.currentTarget.value = ''; }} /></label>
  <textarea
    data-testid="chat-input"
    rows="1"
    placeholder={kind === 'chat' ? '메시지 입력' : '코멘트 입력'}
    bind:value={text}
    onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } }}
    onpaste={(e) => { const fs = [...(e.clipboardData?.files ?? [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } }}
  ></textarea>
  <button type="submit" data-testid="chat-send" disabled={(!text.trim() && !pending.length) || uploading > 0}>전송</button>
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
  .input { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--line); align-items: flex-end; }
  .attach { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; font-size: 16px; }
  .attach:hover { background: var(--hover); }
  .pending { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 8px 0; border-top: 1px solid var(--line); font-size: 12px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; background: var(--input); border: 1px solid var(--line); border-radius: 12px; padding: 2px 8px; }
  .chip button { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 13px; padding: 0; }
  .err { color: var(--danger); }
  .atts { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
  textarea { flex: 1; resize: none; background: var(--input); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px; }
  .input button { background: #fee500; color: #191919; border: 0; border-radius: 8px; padding: 0 12px; font: inherit; font-weight: 700; cursor: pointer; }
  .input button:disabled { opacity: 0.4; cursor: default; }
</style>
