<!--
  디자인 싱크 (2026-11-06 사용자: "아이콘을 하나로 하고 디자인싱크로 버튼 하나 만들고 그안에 대화창으로 일러스트,svg, 코렐드로 선택하고 해당 파일을 보내기 받기 …
  디자인파일은 디자인싱크로 편입 최종적으로 디자인 탭은 디자인싱크 컬러셋 만 남게").
  프로그램(일러스트레이터 · 코렐드로우 · SVG)을 고르고 보내기(간판다 → 프로그램) · 받기(프로그램 → 간판다). 받은 파일은 바로 입히지 않고
  사진보드에서 연결 상태를 확인한 뒤 [확정] (SyncReview) → docs/features/design-sync.md
-->
<script lang="ts">
  import { app } from '../state.svelte';
  import { downloadIllustratorScript, exportIllustrator } from '../illustratorExport';
  import { buildListSvg } from '../listSvgExport';
  import { buildCutSvg } from '../cutExport';
  import { outlineRenderer } from '../core/svgText';
  import { loadFont } from '../core/textShapes';
  import fontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
  import type { SvgSheet } from '../core/listSvg';

  type Program = 'illustrator' | 'corel' | 'svg';
  const PROGRAMS: { id: Program; label: string }[] = [{ id: 'illustrator', label: '일러스트레이터' }, { id: 'corel', label: '코렐드로우' }, { id: 'svg', label: 'SVG' }];
  const ACCEPT: Record<Program, string> = { illustrator: '.ai,.pdf,.ganpanda', corel: '.pdf,.svg', svg: '.svg,image/*' };
  let program = $state<Program>('illustrator');
  let scale = $state<'a4' | '1' | '0.1'>('1');
  let outline = $state(true);
  let busy = $state(false);
  const close = () => (app.syncOpen = false);
  const exportable = $derived(app.flatCards.some((c) => !c.placeholder));
  const projectName = () => (app.access.status === 'ok' ? app.access.projectName : '간판다');

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { app.notice = `파일을 만들지 못했습니다: ${e instanceof Error ? e.message : e}`; } finally { busy = false; }
  }
  const save = (svg: string, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const zip = () => run(async () => { if (!(await exportIllustrator())) app.notice = '치수가 있는 사인물 카드가 없습니다.'; });
  // 전개도 SVG (금액·합계 없음) — 대지 레이어(사인물마다 사각형)는 그대로
  const svg = (s: typeof scale) => run(async () => {
    const opts: Partial<SvgSheet> = { artboards: true };
    if (s !== 'a4') opts.scale = Number(s);
    if (outline) opts.text = outlineRenderer(await loadFont(fontUrl));
    const out = await buildListSvg(opts, { amounts: false });
    app.lastSvg = out;
    save(out, `${projectName()} 전개도${s === 'a4' ? '' : s === '1' ? ' 1-1' : ' 1-10'}.svg`);
  });
  // 칼선 (roadmap 10-2): 채널·스카시 글자·벡터 윤곽만 CutContour 레이어로, 실물 1:1
  const cut = () => run(async () => {
    const { svg: out, count } = await buildCutSvg();
    if (!count) { app.notice = '칼선을 낼 입체 글자·벡터가 없습니다 (채널·스카시 구성 요소의 글자 또는 일러스트 벡터).'; return; }
    app.lastSvg = out;
    save(out, `${projectName()} 칼선 1-1.svg`);
  });
  function receive(f: File | undefined) {
    if (!f) return;
    close();
    void app.addSourceFile(f);
  }
</script>

<div class="backdrop" role="presentation" onkeydown={(e) => { if (e.key === 'Escape') close(); }} onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="디자인 싱크" data-testid="design-sync-dialog">
    <header><h2>⇄ 디자인 싱크</h2><button class="icon" data-testid="design-sync-close" onclick={close} title="닫기">✕</button></header>
    <div class="programs" role="tablist">
      {#each PROGRAMS as p (p.id)}<button role="tab" class:on={program === p.id} aria-selected={program === p.id} data-testid="sync-program-{p.id}" onclick={() => (program = p.id)}>{p.label}</button>{/each}
    </div>
    {#if app.unconfirmedCount}<p class="unconfirmed" data-testid="unconfirmed-warning">⚠ 고객 컨펌 뒤 바뀐 사인물 {app.unconfirmedCount}개 — 보내는 파일은 지금 내용입니다. 변경 견적을 발행해 고객이 컨펌한 뒤 출력하세요(견적 탭 [바뀐 내용]).</p>{/if}

    <section data-testid="sync-send">
      <h3>보내기 <small>간판다 → {PROGRAMS.find((p) => p.id === program)!.label}</small></h3>
      {#if program === 'illustrator'}
        <div class="row">
          <button class="btn small primary" data-testid="illustrator-download" disabled={busy || !exportable} onclick={zip}>대지 받기 (zip)</button>
          <button class="btn small" data-testid="illustrator-script" onclick={() => downloadIllustratorScript()}>설치용 스크립트 (간판다.jsx)</button>
        </div>
        <small class="tip" data-testid="illustrator-define">사인물마다 크기대로 <b>대지</b>, 레이어는 <b>받은 이미지</b>(카드의 최종 그림 — 디자인 › 2D 속성 내용 › 사진, 잠금) · <b>디자인</b>(여기에 디자인) · <b>path</b>(입체로 만들 패스).</small>
        <small class="tip" data-testid="illustrator-install-tip">zip 을 풀면 프로젝트 이름 폴더(ganpanda.json · images · ganpanda.jsx). 한 번만: <b>간판다.jsx</b> 를 일러스트 스크립트 폴더(맥: 응용 프로그램 › Adobe Illustrator › Presets › ko_KR › 스크립트, 윈도우: Program Files › Adobe › Adobe Illustrator › Presets › ko_KR › 스크립트)에 넣고 일러스트를 다시 켜면 <b>파일 › 스크립트 › 간판다</b>. 실행 → 받은 폴더를 고르면 사인물마다 대지·구성 요소 레이어. 설치 없이: 폴더 안 ganpanda.jsx 를 <b>파일 › 스크립트 › 기타 스크립트…</b></small>
      {:else}
        {#if program === 'svg'}
          <div class="choices" role="radiogroup" aria-label="비율">
            <span class="lbl">비율</span>
            <label title="제작 도면, mm 그대로"><input type="radio" name="svgscale" value="1" bind:group={scale} data-testid="svg-scale-1" /> 실물 1:1</label>
            <label title="큰 간판 · 아트보드 한계 5.8m"><input type="radio" name="svgscale" value="0.1" bind:group={scale} data-testid="svg-scale-10" /> 1:10</label>
            <label title="A4 한 장"><input type="radio" name="svgscale" value="a4" bind:group={scale} data-testid="svg-scale-a4" /> A4 맞춤</label>
          </div>
        {/if}
        <label class="check" title="폰트 없어도 같은 모양, 글자 편집 불가"><input type="checkbox" bind:checked={outline} data-testid="svg-outline" /> 글자 윤곽선</label>
        <div class="row">
          <button class="btn small primary" data-testid="svg-download" disabled={busy || !exportable} onclick={() => svg(program === 'corel' ? '1' : scale)}>{program === 'corel' ? '전개도 SVG (실물 1:1)' : '전개도 SVG'}</button>
          <button class="btn small" data-testid="cut-download" disabled={busy || !exportable} title="채널·스카시 글자와 일러스트 벡터의 윤곽만, 실물 1:1(mm) — 커팅 플로터·레이저용 CutContour 레이어" onclick={cut}>칼선 SVG</button>
        </div>
        <small class="tip" data-testid="svg-artboards-tip">{#if program === 'corel'}코렐: <b>파일 › 가져오기</b>(Ctrl+I)로 SVG — <b>대지</b> 레이어의 사각형이 사인물 자리입니다. 사인물마다 페이지(실물 1:1 또는 1:10 크기)로 나눠 작업하세요.{:else}사인물마다 같은 자리에 "대지" 레이어의 사각형이 있습니다. 일러스트에서는 레이어 <b>대지</b> 선택 → <b>오브젝트 › 대지 › 선택 오브젝트를 대지로 변환</b>.{/if} 금액·합계는 들어가지 않습니다.</small>
      {/if}
    </section>

    <section data-testid="sync-receive">
      <h3>받기 <small>{PROGRAMS.find((p) => p.id === program)!.label} → 간판다</small></h3>
      {#if app.canEdit}
        <label class="btn small primary up">파일 고르기<input data-testid="sync-receive-input" type="file" accept={ACCEPT[program]} hidden onchange={(e) => { receive(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></label>
      {/if}
      <small class="tip">
        {#if program === 'illustrator'}스크립트를 다시 실행 → [간판다로 보내기]가 만든 <b>.ganpanda</b> — 대지 이름으로 사인물을 찾아 <b>디자인</b>은 대지 이미지로 카드에 바로, <b>path</b> 는 고른 구성물(채널·스카시)의 입체로. (저장한 .ai 를 올리면 대지 전체가 디자인으로)
        {:else if program === 'corel'}사인물마다 한 페이지로 <b>PDF 내보내기</b> — 페이지 크기(1:1·1:10)로 사인물을 찾습니다.
        {:else}SVG·그림은 디자인 파일에 들어갑니다 — 아래 [디자인 파일]에서 영역을 그려 사인물에 연결하세요.{/if}
        받은 뒤 사진보드에서 사인물마다 <b>연결 · 바뀜 · 새로 생김 · 누락</b>을 확인하고 <b>[확정]</b>해야 입혀집니다.
      </small>
    </section>

    <footer>
      <button class="btn small" data-testid="sync-design-files" title="올린 디자인 파일을 보고 영역을 그려 사인물에 연결" onclick={() => { app.view = 'uv'; close(); }}>디자인 파일 {app.sources.length}</button>
      {#if app.selected && app.canEdit}<button class="btn small" data-testid="sync-link-selected" title="이 사인물에 디자인 파일 영역 연결" onclick={() => { app.view = 'uv'; close(); }}>고른 사인물에 연결</button>{/if}
      {#if busy || app.converting}<span class="muted">만드는 중…</span>{/if}
    </footer>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .dialog { width: min(520px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 16px; }
  h3 { margin: 0 0 6px; font-size: 13px; }
  h3 small { color: var(--muted); font-weight: 400; margin-left: 4px; }
  .programs { display: flex; gap: 2px; background: var(--input); padding: 3px; border-radius: 9px; }
  .programs button { flex: 1; background: none; border: 0; color: var(--muted); padding: 7px 10px; border-radius: 7px; font: inherit; cursor: pointer; }
  .programs button.on { background: var(--panel); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }
  section { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .choices { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
  .choices .lbl { color: var(--muted); }
  label { display: inline-flex; flex-direction: row; align-items: center; gap: 4px; white-space: nowrap; font-size: 13px; color: var(--text); }
  .up { align-self: flex-start; cursor: pointer; }
  .tip { display: block; color: var(--muted); line-height: 1.45; font-size: 12px; }
  .tip b { color: var(--text); }
  .unconfirmed { margin: 0; color: #fb923c; font-size: 12px; line-height: 1.4; }
  footer { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .muted { color: var(--muted); font-size: 12px; }
</style>
