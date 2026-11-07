<!--
  디자인 싱크 받기 검토 (2026-11-06 사용자: "받은 다음 사진보드에서 연결상태 확인 후 확정 버튼으로 파일연결 누락이나 새로 생긴 경우 처리방안 필요").
  사진보드 카드에 상태(연결·바뀜·누락)가 보이고, 이 패널에서 줄마다 처리를 고른 뒤 [확정]. 새로 생긴 대지는 카드가 없어 여기에만 → docs/features/design-sync.md
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { SYNC_ACTION_LABEL, SYNC_STATUS_LABEL, type SyncAction, type SyncStatus } from '../core/designSync';
  import { partLabel, partsOf } from '../core/parts';

  const r = $derived(app.syncReview!);
  const ORDER: SyncStatus[] = ['new', 'missing', 'update', 'link'];
  const rows = $derived([...r.rows].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)));
  const count = (s: SyncStatus) => r.rows.filter((x) => x.status === s).length;
  const nameOf = (id?: string) => { const o = id ? app.project.object(id) : undefined; return o ? `${o.artNo ? `#${o.artNo} ` : ''}${o.name}` : id ? '간판다에 없는 사인물' : ''; };
  const what = (row: (typeof rows)[number]) => {
    if (row.status === 'new') return row.page !== undefined ? `대지 ${row.page + 1}${row.w ? ` · ${row.w.toLocaleString()}×${row.h!.toLocaleString()}mm` : ''}` : nameOf(row.signId);
    const got = [row.design ? '디자인' : '', row.path ? 'path' : '', row.parts ? `구성 요소 ${row.parts.length}` : ''].filter(Boolean).join(' · ');
    return `${nameOf(row.signId)}${row.page !== undefined ? ` ← 대지 ${row.page + 1}` : ''}${got ? ` · ${got}` : ''}`;
  };
  /** path 를 받을 구성물 이름 (2026-11-06 "path는 대지 이름을 통해 사인물을 찾고 해당 구성물의 path에 사용자가 연결한다") */
  const partName = (signId: string | undefined, partId: string) => { const o = signId ? app.project.object(signId) : undefined; const p = o ? partsOf(o).find((x) => x.id === partId) : undefined; return p ? partLabel(p) : partId; };
  let busy = $state(false);
  async function confirm() { if (busy) return; busy = true; try { await app.confirmSync(); } finally { busy = false; } }
</script>

<div class="review" data-testid="sync-review" role="dialog" aria-label="받은 디자인 검토">
  <header>
    <b>받은 디자인 검토</b><small title={r.fileName}>{r.fileName}</small>
  </header>
  <div class="counts">
    {#each ORDER as s (s)}{#if count(s)}<span class="chip {s}" data-testid="sync-count-{s}">{SYNC_STATUS_LABEL[s]} {count(s)}</span>{/if}{/each}
  </div>
  <ul>
    {#each rows as row (row.key)}
      <li data-testid="sync-row" data-status={row.status} data-sign={row.signId}>
        <span class="chip {row.status}">{SYNC_STATUS_LABEL[row.status]}</span>
        <button class="name" disabled={!row.signId || !app.project.object(row.signId)} onclick={() => row.signId && app.selectObject(row.signId)}>{what(row)}</button>
        {#if row.actions.length > 1}
          <select data-testid="sync-action" value={row.action} onchange={(e) => app.setSyncAction(row.key, e.currentTarget.value as SyncAction)}>
            {#each row.actions as a (a)}<option value={a}>{SYNC_ACTION_LABEL[a]}</option>{/each}
          </select>
        {:else}<span class="fixed">{SYNC_ACTION_LABEL[row.action]}</span>{/if}
      </li>
      {#if row.designBlank}
        <li class="sub warn" data-testid="sync-blank" data-sign={row.signId}>⚠ 받은 디자인이 비어 있어(투명하거나 받은 이미지 말고 그린 것이 없음) 넣지 않습니다 — 일러스트에서 대지 안 디자인을 확인하고 다시 보내 주세요.</li>
      {/if}
      {#if row.layers && row.action === 'apply'}
        <!-- PDF 레이어 → 구성물 (2026-11-07 "연결된 pdf를 통해 path를 추출해 바로 연결 후 3d로" → 레이어로 고르기) -->
        {#each row.layers as l (l.name)}
          <li class="sub" data-testid="sync-layer-row" data-sign={row.signId} data-layer={l.name}>
            <span class="arrow">레이어 "{l.name}"{l.paths ? ` · 모양 ${l.paths}` : ''} →</span>
            {#if l.paths && row.pathParts?.length}
              <select data-testid="sync-layer" value={row.layerParts?.[l.name] ?? ''} onchange={(e) => app.setSyncLayer(row.key, l.name, e.currentTarget.value)}>
                <option value="">입체 안 함 (그림만)</option>
                {#each row.pathParts as pid (pid)}<option value={pid}>{partName(row.signId, pid)} 입체</option>{/each}
              </select>
            {:else if l.paths}<span class="fixed">입체 구성물(채널·스카시) 없음</span>
            {:else}<span class="fixed warn-t" data-testid="sync-layer-text">글자가 윤곽선이 아니라 입체가 안 됩니다 — 간판다 스크립트 [내보내기]로 저장하면 자동으로 윤곽선</span>{/if}
          </li>
        {/each}
      {/if}
      {#if row.path && row.action === 'apply'}
        <li class="sub" data-testid="sync-path-row" data-sign={row.signId}>
          <span class="arrow">path →</span>
          {#if row.pathParts?.length}
            <select data-testid="sync-path" value={row.pathPart ?? ''} onchange={(e) => app.setSyncPath(row.key, e.currentTarget.value)}>
              <option value="">구성물 고르기 (안 넣음)</option>
              {#each row.pathParts as pid (pid)}<option value={pid}>{partName(row.signId, pid)}</option>{/each}
            </select>
          {:else}<span class="fixed">입체 구성물(채널·스카시)이 없어 넣지 않음</span>{/if}
        </li>
      {/if}
    {/each}
    {#if !rows.length}<li class="empty">이 프로젝트 사인물과 짝지은 대지가 없습니다.</li>{/if}
  </ul>
  <small class="tip">디자인은 사인물 카드에 바로 들어가고, path 는 고른 구성물(채널·스카시)의 입체가 됩니다. 누락 = 보낸 사인물인데 받은 파일에 없음 · 새로 생김 = 파일에만 있는 대지. 확정 전에는 아무것도 바뀌지 않습니다.</small>
  <footer>
    <button class="btn small" data-testid="sync-cancel" onclick={() => app.cancelSync()}>취소</button>
    <button class="btn small primary" data-testid="sync-confirm" disabled={busy || !app.canEdit} onclick={confirm}>{busy ? '적용 중…' : '확정'}</button>
  </footer>
</div>

<style>
  .review { position: fixed; right: 16px; top: 64px; z-index: 800; width: min(380px, calc(100vw - 24px)); max-height: calc(100dvh - 90px); display: flex; flex-direction: column; gap: 8px; background: var(--panel); color: var(--text); border: 1px solid var(--accent); border-radius: 12px; padding: 12px 14px; box-sizing: border-box; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); font-size: 13px; }
  header { display: flex; flex-direction: column; gap: 2px; }
  header small { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .counts { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { flex: none; display: inline-block; padding: 1px 7px; border-radius: 6px; font-size: 11px; font-weight: 600; color: #fff; white-space: nowrap; }
  .chip.link { background: #166534; } .chip.update { background: #1d4ed8; } .chip.missing { background: #c2410c; } .chip.new { background: #7c3aed; }
  ul { list-style: none; margin: 0; padding: 0; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
  li { display: flex; align-items: center; gap: 6px; }
  .name { flex: 1; min-width: 0; text-align: left; background: none; border: 0; color: var(--text); font: inherit; padding: 2px 0; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name:disabled { cursor: default; color: var(--muted); }
  select { flex: none; width: auto; max-width: 45%; font: inherit; font-size: 12px; background: var(--input); color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 2px 4px; }
  .fixed { color: var(--muted); font-size: 12px; }
  .empty { color: var(--muted); }
  li.sub { padding-left: 22px; justify-content: flex-end; }
  .warn-t { color: #fb923c; }
  li.warn { color: #fb923c; font-size: 12px; line-height: 1.4; justify-content: flex-start; }
  .arrow { flex: 1; color: var(--muted); font-size: 12px; }
  .tip { color: var(--muted); line-height: 1.4; font-size: 11px; }
  footer { display: flex; justify-content: flex-end; gap: 8px; }
  @media (max-width: 720px) { .review { top: auto; bottom: 12px; right: 12px; left: 12px; width: auto; max-height: 50dvh; } }
</style>
