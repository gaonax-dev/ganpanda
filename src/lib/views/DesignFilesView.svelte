<!--
  디자인 파일 화면 = 대지 카드 목록 (2026-11-07 사용자: "현재 디자인파일 화면을 이해하기 어렵다" → (질문) "대지 카드 목록").
  파일마다 대지(페이지) 카드: 그림 · 쪽·크기 · 연결된 사인물(#번호 이름, × 해제) · [사인물에 연결 ▾](대지 전체) · [영역 고르기](일부만 — 예전 캔버스 화면 UvView).
  → docs/features/design-sync.md
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { assetUrl } from '../assets';

  let urls = $state<Record<string, string>>({});
  $effect(() => { for (const s of app.sources) for (const pg of s.pages) if (!urls[pg.assetId]) assetUrl(pg.assetId).then((u) => u && (urls = { ...urls, [pg.assetId]: u })); });

  /** 최근 파일이 위 */
  const sources = $derived([...app.designFiles].reverse());
  const signName = (o: { name: string; artNo?: number }) => `${o.artNo ? `#${o.artNo} ` : ''}${o.name}`;
  const linked = (sourceId: string, page: number) => app.signs.filter((o) => o.design?.sourceId === sourceId && o.design.page === page);
  const time = (ts?: number) => (ts ? new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  /** 대지 전체를 사인물에 */
  function link(sourceId: string, page: number, signId: string) {
    const pg = app.sources.find((s) => s.id === sourceId)?.pages[page];
    if (!pg || !signId) return;
    app.setDesign(signId, { sourceId, page, crop: { x: 0, y: 0, w: pg.w, h: pg.h } });
  }
  /** 영역 고르기 — 캔버스 화면에서 이 대지를 보며 그 사인물(고른 것이 있으면)에 영역을 그린다 */
  function crop(signId?: string) {
    if (signId) app.uvObjectId = signId;
    app.uvCrop = true;
  }
  const upload = (e: Event & { currentTarget: HTMLInputElement }) => { const f = e.currentTarget.files?.[0]; if (f) void app.addSourceFile(f); e.currentTarget.value = ''; };
</script>

<div class="files" data-testid="design-files">
  <header>
    <div>
      <h2>디자인 파일 <small>{app.designFiles.length}</small></h2>
      <p class="hint">대지(페이지)마다 어느 사인물에 입혀졌는지 보고, 바로 연결하거나 일부만 잘라 입힙니다. 일러스트·코렐과 주고받기는 [⇄ 디자인 싱크].</p>
    </div>
    {#if app.canEdit}<label class="btn primary">＋ 디자인 파일 올리기<input data-testid="source-input" type="file" accept=".pdf,.ai,.svg,.ganpanda,image/*" hidden onchange={upload} /></label>{/if}
    {#if app.converting}<span class="hint">변환 중…</span>{/if}
  </header>

  {#each sources as s (s.id)}
    <section data-testid="design-file" data-id={s.id}>
      <h3>{s.name} <small>{s.pages.length}쪽{s.author ? ` · ${s.author}` : ''}{s.createdAt ? ` · ${time(s.createdAt)}` : ''}</small></h3>
      <div class="grid">
        {#each s.pages as pg, i (pg.assetId + i)}
          {@const on = linked(s.id, i)}
          <article class="card" class:used={on.length > 0} data-testid="page-card" data-page={i}>
            <div class="thumb">{#if urls[pg.assetId]}<img src={urls[pg.assetId]} alt="{s.name} {i + 1}쪽" draggable="false" />{:else}<span class="hint">불러오는 중…</span>{/if}</div>
            <div class="meta"><b>{i + 1}쪽</b><small>{pg.w}×{pg.h}px</small></div>
            <div class="linked">
              {#each on as o (o.id)}
                <span class="chip" data-testid="page-linked">{signName(o)}{#if o.design && (o.design.crop.x !== 0 || o.design.crop.y !== 0 || o.design.crop.w !== pg.w || o.design.crop.h !== pg.h)}<em> · 일부</em>{/if}
                  {#if app.canEdit}<button class="x" title="연결 해제 (디자인 떼기)" data-testid="page-unlink" onclick={() => app.clearDesign(o.id)}>×</button>{/if}</span>
              {:else}<span class="none">연결된 사인물 없음</span>{/each}
            </div>
            {#if app.canEdit}
              <div class="acts">
                <select data-testid="page-link" value="" onchange={(e) => { link(s.id, i, e.currentTarget.value); e.currentTarget.value = ''; }}>
                  <option value="">사인물에 연결 (대지 전체) ▾</option>
                  {#each app.signs as o (o.id)}<option value={o.id}>{signName(o)}{o.design ? ' — 디자인 있음' : ''}</option>{/each}
                </select>
                <button class="btn small" data-testid="page-crop" title="이 대지에서 일부만 잘라 사인물에 입히기" onclick={() => crop(on[0]?.id)}>영역 고르기</button>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    </section>
  {:else}
    <div class="empty">
      <p>아직 디자인 파일이 없습니다.</p>
      <small>일러스트(.ai PDF 호환) · PDF · SVG · PNG · JPG — 일러스트 왕복은 [⇄ 디자인 싱크]에서</small>
    </div>
  {/each}
</div>

<style>
  .files { position: absolute; inset: 0; overflow: auto; padding: 18px 20px 40px; display: flex; flex-direction: column; gap: 18px; box-sizing: border-box; }
  header { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  header > div { flex: 1; min-width: 240px; }
  h2 { margin: 0; font-size: 17px; }
  h2 small, h3 small { color: var(--muted); font-weight: 400; font-size: 12px; margin-left: 4px; }
  h3 { margin: 0 0 8px; font-size: 14px; }
  .hint { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
  .btn.primary { cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  .card.used { border-color: color-mix(in srgb, var(--ok) 60%, var(--line)); }
  .thumb { height: 150px; border-radius: 8px; background: #fff; display: grid; place-items: center; overflow: hidden; }
  .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .meta { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
  .meta small { color: var(--muted); font-size: 11px; }
  .linked { display: flex; flex-wrap: wrap; gap: 4px; min-height: 24px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--ok) 18%, transparent); border: 1px solid color-mix(in srgb, var(--ok) 50%, transparent); font-size: 12px; }
  .chip em { color: var(--muted); font-style: normal; }
  .chip .x { background: none; border: 0; color: var(--muted); cursor: pointer; font-size: 14px; line-height: 1; padding: 0 4px; }
  .chip .x:hover { color: var(--text); }
  .none { color: var(--muted); font-size: 12px; }
  .acts { display: flex; gap: 6px; }
  .acts select { flex: 1; min-width: 0; font: inherit; font-size: 12px; background: var(--input); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 5px 6px; }
  .empty { margin: 60px auto; text-align: center; color: var(--muted); display: flex; flex-direction: column; gap: 6px; }
  .empty p { color: var(--text); margin: 0; }
  @media (max-width: 720px) { .files { padding: 12px 12px 90px; } .grid { grid-template-columns: 1fr; } }
</style>
