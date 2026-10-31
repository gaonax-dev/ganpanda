<!--
  채널 키트 공개 (2026-10-31 사용자: "운영자만, 초안 공개 2단계로 진행해줘"): 블렌더 애드온이 올린 초안을 이 기기에서 미리 보고(사인물 설정의 채널 미리보기·그림 카드),
  [공개]하면 모두에게. 지난 판으로 [되돌리기]. 서버 /api/kit/*
-->
<script lang="ts">
  import { SERVER_URL } from '../sync';
  import { loadSession } from '../auth';
  import { askConfirm } from './ask.svelte';
  import { kitDraftOn, setKitDraft } from '../render/kitView';

  let info = $state<{ versions: number[]; draft: number | null; published: number | null } | null>(null);
  let preview = $state(kitDraftOn());
  let busy = $state(false), error = $state(''), done = $state('');
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const s = loadSession();
    const r = await fetch(`${SERVER_URL}${path}`, { method, headers: { ...(s ? { authorization: `Bearer ${s}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  };
  const load = async () => { try { info = await call('/api/kit/history'); } catch (e) { error = `불러오지 못했습니다 (${(e as Error).message})`; } };
  void load();
  async function run(fn: () => Promise<unknown>, msg: string) {
    busy = true; error = ''; done = '';
    try { await fn(); done = msg; await load(); setKitDraft(preview); } catch (e) { error = `실패 (${(e as Error).message})`; } finally { busy = false; }
  }
  const togglePreview = () => { preview = !preview; setKitDraft(preview); done = preview ? '이 기기에서 초안이 보입니다 — 사인물 설정의 채널 미리보기·그림 카드' : '공개판으로 돌아왔습니다'; };
  const publish = async () => { if (await askConfirm(`초안 ${info?.draft}판을 공개할까요? 모든 사용자의 채널 미리보기·그림 카드가 바뀝니다.`)) void run(() => call('/api/kit/publish', 'POST', {}), '공개했습니다'); };
  const rollback = async (v: number) => { if (await askConfirm(`${v}판으로 되돌릴까요? 새 판 번호로 다시 공개됩니다.`)) void run(() => call('/api/kit/rollback', 'POST', { version: v }), `${v}판으로 되돌렸습니다`); };
</script>

<section data-testid="kit-ops">
  <p class="hint">블렌더 "간판다" 애드온의 [보내기]는 초안으로 올라옵니다. 이 기기에서 미리 본 뒤 공개하세요. 파일은 내용 해시 이름이라 공개해도 지난 판은 그대로 남습니다.</p>
  {#if info}
    <p class="row"><span>공개판 <b data-testid="kit-published">{info.published ?? '없음 (앱에 든 기본 키트)'}</b></span><span>초안 <b data-testid="kit-draft">{info.draft ?? '없음'}</b></span></p>
    <div class="acts">
      <button class="btn small" data-testid="kit-preview-toggle" class:on={preview} onclick={togglePreview}>{preview ? '초안 미리보기 끄기' : '초안 미리보기 (이 기기)'}</button>
      <button class="btn small primary" data-testid="kit-publish" disabled={busy || !info.draft || info.draft === info.published} onclick={publish}>초안 공개</button>
    </div>
    {#if info.versions.length}
      <h2 class="sub">지난 판</h2>
      <ul class="hist">
        {#each info.versions as v (v)}
          <li data-testid="kit-version"><span>{v}판{#if v === info.published} <small>(공개 중)</small>{/if}</span>{#if v !== info.published}<button class="btn small" data-testid="kit-rollback" disabled={busy} onclick={() => rollback(v)}>되돌리기</button>{/if}</li>
        {/each}
      </ul>
    {/if}
  {/if}
  {#if done}<p class="hint ok" data-testid="kit-done">{done}</p>{/if}
  {#if error}<p class="hint err">{error}</p>{/if}
</section>

<style>
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
  .on { border-color: var(--accent); }
  .hist { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .hist li { display: flex; gap: 10px; align-items: center; }
  .ok { color: var(--ok); }
  .err { color: var(--danger); }
</style>
