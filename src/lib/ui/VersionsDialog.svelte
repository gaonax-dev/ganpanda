<!--
  버전 기록 (2026-10-21 사용자: "사용자가 직접 이전 상태로 돌리는 것도 유료에 도입하면 어떨까?" → "그 순서대로 진행해줘"):
  날짜별 버전(매시간 자동 백업의 그날 마지막·직접 저장·되돌리기 직전)을 보여 주고 [되돌리기]·[새 프로젝트로]. [지금 상태 저장]으로 직접 남긴다.
  무료는 요금제 안내, 베이직 7일·프로 30일(+직접 저장 계속) — 서버가 기간을 거른다. 되돌리면 함께 보는 모두에게 안내(설정 restored)
-->
<script lang="ts">
  import { paymentsShown } from '../auth';
  import { askConfirm } from './ask.svelte';
  import { app } from '../state.svelte';
  import { AuthError } from '../auth';
  import { copyVersion, listVersions, restoreVersion, saveVersion, type VersionInfo } from '../projects';

  let versions = $state<VersionInfo[] | null>(null);
  let upgrade = $state(false);
  let error = $state('');
  let busy = $state(false);
  let label = $state('');
  let copied = $state<{ id: string; name: string } | null>(null);
  const room = app.room!;
  const invite = app.role === 'owner' ? null : app.invite;

  async function load() {
    error = '';
    try { versions = await listVersions(room, invite); upgrade = false; }
    catch (e) { if (e instanceof AuthError && e.status === 402) upgrade = true; else error = '버전 목록을 불러오지 못했습니다.'; }
  }
  void load();
  const KIND = { auto: '자동', manual: '직접 저장', before: '되돌리기 전' } as const;
  const when = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  async function run(f: () => Promise<unknown>) { busy = true; error = ''; try { await f(); await load(); } catch { error = '처리하지 못했습니다. 다시 시도해 주세요.'; } finally { busy = false; } }
  const save = () => run(async () => { await saveVersion(room, invite, label.trim()); label = ''; });
  async function restore(v: VersionInfo) {
    if (!(await askConfirm(`${when(v.at)} ${v.label ?? KIND[v.kind]} 버전으로 되돌릴까요? 함께 보는 모든 사람에게 적용됩니다. 지금 상태는 "되돌리기 전" 버전으로 남습니다. (대화는 그대로)`))) return;
    void run(() => restoreVersion(room, invite, v.key));
  }
  const copy = (v: VersionInfo) => run(async () => { copied = await copyVersion(room, invite, v.key); });
</script>

<div class="backdrop" role="presentation" onclick={() => (app.versionsOpen = false)}>
  <div class="dialog" role="dialog" aria-label="버전 기록" data-testid="versions-dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') app.versionsOpen = false; }}>
    <header><b>버전 기록</b><button class="icon" data-testid="versions-close" title="닫기" onclick={() => (app.versionsOpen = false)}>✕</button></header>
    {#if upgrade}
      <p class="hint" data-testid="versions-upgrade">{paymentsShown() ? '이전 상태로 되돌리기는 유료 기능입니다. 베이직은 최근 7일, 프로는 최근 30일과 직접 저장한 버전을 계속 보관합니다.' : '이 계정에서는 이전 상태로 되돌리기를 쓸 수 없습니다.'}</p>
    {:else}
      <form class="save" onsubmit={(e) => { e.preventDefault(); void save(); }}>
        <input data-testid="versions-label" placeholder="버전 이름 (예: 시안 1, 고객 확인 전)" bind:value={label} maxlength="60" />
        <button class="btn small primary" data-testid="versions-save" type="submit" disabled={busy}>지금 상태 저장</button>
      </form>
      {#if copied}
        <p class="ok" data-testid="versions-copied">새 프로젝트 "{copied.name}"를 만들었습니다. <a href="/?room={copied.id}">열기</a></p>
      {/if}
      {#if error}<p class="err">{error}</p>{/if}
      {#if versions === null}<p class="hint">불러오는 중…</p>
      {:else if !versions.length}<p class="hint">아직 버전이 없습니다. 바뀐 내용은 매시간 자동으로 남고, [지금 상태 저장]으로 직접 남길 수 있습니다.</p>
      {:else}
        <ul>
          {#each versions as v (v.key)}
            <li data-testid="versions-item" data-kind={v.kind}>
              <span class="when">{when(v.at)}</span>
              <span class="kind {v.kind}">{v.label ?? KIND[v.kind]}</span>
              {#if v.by}<small>{v.by}</small>{/if}
              <span class="acts">
                <button class="btn small" data-testid="versions-restore" disabled={busy || !app.canEdit} onclick={() => restore(v)}>되돌리기</button>
                {#if app.role === 'owner'}<button class="btn small" data-testid="versions-copy" disabled={busy} title="지금 작업은 두고 이 버전으로 새 프로젝트" onclick={() => copy(v)}>새 프로젝트로</button>{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="hint">되돌리면 사진·사인물·말풍선·설정이 그 버전으로 바뀌고, 대화는 그대로 남습니다.</p>
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.5); display: grid; place-items: center; }
  .dialog { width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 48px); overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  header { display: flex; align-items: center; justify-content: space-between; font-size: 15px; }
  .save { display: flex; gap: 6px; }
  .save input { flex: 1; min-width: 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
  .when { font-variant-numeric: tabular-nums; }
  .kind { color: var(--muted); }
  .kind.manual { color: var(--accent); font-weight: 600; }
  .acts { margin-left: auto; display: flex; gap: 4px; }
  .hint { color: var(--muted); font-size: 12px; margin: 0; }
  .err { color: var(--warn); font-size: 12px; margin: 0; }
  .ok { color: var(--ok); font-size: 13px; margin: 0; }
</style>
