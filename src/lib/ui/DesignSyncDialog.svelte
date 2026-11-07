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
  // 버튼 상태 (2026-11-06 "스크립트 다운로드가 시각화 되지 않아 계속누르게 된다. 나머지 버튼도 시각화와 완료상태 보여줘"):
  // 누르면 만드는 중(다른 버튼 잠김) → ✓ 완료(창을 닫을 때까지) · 실패면 다시 시도. 창을 닫으면 처음 상태
  type Act = 'zip' | 'script' | 'svg' | 'cut' | 'receive';
  /** 이 창에서 받은 파일 이름 (최근이 앞) — 웹은 저장 경로를 알 수 없어 이름과 찾는 법을 보인다 (2026-11-06 "다운로드 위치를 사용자가 브라우저에서 확인해야 된다") */
  let saved = $state<string[]>([]);
  const remember = (name: string) => { saved = [name, ...saved.filter((n) => n !== name)].slice(0, 5); };
  const inApp = typeof navigator !== 'undefined' && /Ganpanda-App\//.test(navigator.userAgent);
  let st = $state<Partial<Record<Act, 'busy' | 'done' | 'error'>>>({});
  const busy = $derived(Object.values(st).includes('busy') || app.converting);
  const close = () => (app.syncOpen = false);
  const exportable = $derived(app.flatCards.some((c) => !c.placeholder));
  const projectName = () => (app.access.status === 'ok' ? app.access.projectName : '간판다');
  const BUSY_LABEL: Record<Act, string> = { zip: '대지 만드는 중…', script: '받는 중…', svg: 'SVG 만드는 중…', cut: '칼선 만드는 중…', receive: '받는 중…' };
  /** 버튼 글자: 만드는 중 / ✓ 완료 / 다시 시도 */
  const label = (k: Act, text: string) => (st[k] === 'busy' ? BUSY_LABEL[k] : st[k] === 'done' ? `✓ ${text}` : st[k] === 'error' ? `다시 시도 · ${text}` : text);

  /** fn 이 false 를 돌려주면 실패(알림은 fn 이) */
  async function run(k: Act, fn: () => Promise<boolean | void>) {
    if (busy) return;
    st = { ...st, [k]: 'busy' };
    await new Promise((r) => setTimeout(r, 0)); // 만드는 중 표시를 먼저 그린다
    try { st = { ...st, [k]: (await fn()) === false ? 'error' : 'done' }; }
    catch (e) { st = { ...st, [k]: 'error' }; app.notice = `파일을 만들지 못했습니다: ${e instanceof Error ? e.message : e}`; }
  }
  const save = (svg: string, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    remember(name);
  };
  const zip = () => run('zip', async () => { const n = await exportIllustrator(); if (n) { remember(n); return true; } app.notice = '치수가 있는 사인물 카드가 없습니다.'; return false; });
  const script = () => run('script', async () => { remember(downloadIllustratorScript()); });
  // 전개도 SVG (금액·합계 없음) — 대지 레이어(사인물마다 사각형)는 그대로
  const svg = (s: typeof scale) => run('svg', async () => {
    const opts: Partial<SvgSheet> = { artboards: true };
    if (s !== 'a4') opts.scale = Number(s);
    if (outline) opts.text = outlineRenderer(await loadFont(fontUrl));
    const out = await buildListSvg(opts, { amounts: false });
    app.lastSvg = out;
    save(out, `${projectName()} 전개도${s === 'a4' ? '' : s === '1' ? ' 1-1' : ' 1-10'}.svg`);
  });
  // 칼선 (roadmap 10-2): 채널·스카시 글자·벡터 윤곽만 CutContour 레이어로, 실물 1:1
  const cut = () => run('cut', async () => {
    const { svg: out, count } = await buildCutSvg();
    if (!count) { app.notice = '칼선을 낼 입체 글자·벡터가 없습니다 (채널·스카시 구성 요소의 글자 또는 일러스트 벡터).'; return false; }
    app.lastSvg = out;
    save(out, `${projectName()} 칼선 1-1.svg`);
  });
  // 받기: 끝날 때까지 창에서 받는 중 → 검토가 열리면 창을 닫는다(사진보드에서 확인), 아니면 ✓ (디자인 파일에 들어감)
  function receive(f: File | undefined) {
    if (!f) return;
    void run('receive', async () => {
      await app.addSourceFile(f);
      if (app.syncReview) close();
    });
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
          <button class="btn small primary" data-testid="illustrator-download" data-state={st.zip ?? 'idle'} class:done={st.zip === 'done'} class:err={st.zip === 'error'} disabled={busy || !exportable} onclick={zip}>{#if st.zip === 'busy'}<i class="spin"></i>{/if}{label('zip', '대지 받기 (zip)')}</button>
          <button class="btn small" data-testid="illustrator-script" data-state={st.script ?? 'idle'} class:done={st.script === 'done'} class:err={st.script === 'error'} disabled={busy} onclick={script}>{#if st.script === 'busy'}<i class="spin"></i>{/if}{label('script', '설치용 스크립트 (간판다.jsx)')}</button>
        </div>
        <small class="tip" data-testid="illustrator-define">사인물마다 크기대로 <b>대지</b>, 레이어는 <b>받은 이미지</b>(카드의 최종 그림 — 디자인 › 2D 속성 내용 › 사진, 잠금) · <b>디자인</b>(여기에 디자인) · <b>path</b>(입체로 만들 패스).</small>
        <small class="tip" data-testid="illustrator-install-tip">zip 을 풀면 프로젝트 이름 폴더(ganpanda.json · images · ganpanda.jsx). 한 번만: <b>간판다.jsx</b> 를 일러스트 스크립트 폴더(맥: 응용 프로그램 › Adobe Illustrator › Presets › ko_KR › 스크립트, 윈도우: Program Files › Adobe › Adobe Illustrator › Presets › ko_KR › 스크립트)에 넣고 일러스트를 다시 켜면 <b>파일 › 스크립트 › 간판다</b>. 실행 → <b>[가져오기]</b> → 받은 폴더를 고르면 사인물마다 대지·레이어(받은 이미지·디자인·path). 설치 없이: 폴더 안 ganpanda.jsx 를 <b>파일 › 스크립트 › 기타 스크립트…</b></small>
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
          <button class="btn small primary" data-testid="svg-download" data-state={st.svg ?? 'idle'} class:done={st.svg === 'done'} class:err={st.svg === 'error'} disabled={busy || !exportable} onclick={() => svg(program === 'corel' ? '1' : scale)}>{#if st.svg === 'busy'}<i class="spin"></i>{/if}{label('svg', program === 'corel' ? '전개도 SVG (실물 1:1)' : '전개도 SVG')}</button>
          <button class="btn small" data-testid="cut-download" data-state={st.cut ?? 'idle'} class:done={st.cut === 'done'} class:err={st.cut === 'error'} disabled={busy || !exportable} title="채널·스카시 글자와 일러스트 벡터의 윤곽만, 실물 1:1(mm) — 커팅 플로터·레이저용 CutContour 레이어" onclick={cut}>{#if st.cut === 'busy'}<i class="spin"></i>{/if}{label('cut', '칼선 SVG')}</button>
        </div>
        <small class="tip" data-testid="svg-artboards-tip">{#if program === 'corel'}코렐: <b>파일 › 가져오기</b>(Ctrl+I)로 SVG — <b>대지</b> 레이어의 사각형이 사인물 자리입니다. 사인물마다 페이지(실물 1:1 또는 1:10 크기)로 나눠 작업하세요.{:else}사인물마다 같은 자리에 "대지" 레이어의 사각형이 있습니다. 일러스트에서는 레이어 <b>대지</b> 선택 → <b>오브젝트 › 대지 › 선택 오브젝트를 대지로 변환</b>.{/if} 금액·합계는 들어가지 않습니다.</small>
      {/if}
    </section>

    {#if saved.length}
      <div class="saved" data-testid="sync-saved">
        <b>✓ 저장됨 — 다운로드 폴더</b>
        <ul>{#each saved as n (n)}<li>{n}</li>{/each}</ul>
        <small>{inApp ? 'Finder › 다운로드 폴더에서 찾으세요.' : '브라우저 다운로드 목록(크롬 ⌘⇧J · 사파리 ⌥⌘L · 윈도우 Ctrl+J) 또는 다운로드 폴더에서 찾으세요. 브라우저에서 "저장 위치 묻기"를 켰다면 고른 곳에 있습니다.'} 같은 이름이 있으면 브라우저가 이름 뒤에 (1)을 붙입니다.</small>
      </div>
    {/if}

    <section data-testid="sync-receive">
      <h3>받기 <small>{PROGRAMS.find((p) => p.id === program)!.label} → 간판다</small></h3>
      {#if app.canEdit}
        <label class="btn small primary up" data-testid="sync-receive" data-state={st.receive ?? 'idle'} class:done={st.receive === 'done'} class:err={st.receive === 'error'} class:off={busy}>{#if st.receive === 'busy'}<i class="spin"></i>{/if}{label('receive', '파일 고르기')}<input data-testid="sync-receive-input" disabled={busy} type="file" accept={ACCEPT[program]} hidden onchange={(e) => { receive(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} /></label>
      {/if}
      <small class="tip">
        {#if program === 'illustrator'}스크립트를 다시 실행 → <b>[내보내기]</b>가 만든 <b>.ganpanda</b> — 대지 이름으로 사인물을 찾아 <b>디자인</b>은 대지 이미지로 카드에 바로, <b>path</b> 는 고른 구성물(채널·스카시)의 입체로. (저장한 .ai 를 올리면 대지 전체가 디자인으로)
        {:else if program === 'corel'}사인물마다 한 페이지로 <b>PDF 내보내기</b> — 페이지 크기(1:1·1:10)로 사인물을 찾습니다.
        {:else}SVG·그림은 디자인 파일에 들어갑니다 — 아래 [디자인 파일]에서 영역을 그려 사인물에 연결하세요.{/if}
        받은 뒤 사진보드에서 사인물마다 <b>연결 · 바뀜 · 새로 생김 · 누락</b>을 확인하고 <b>[확정]</b>해야 입혀집니다.
      </small>
    </section>

    <footer>
      <button class="btn small" data-testid="sync-design-files" title="올린 디자인 파일을 보고 영역을 그려 사인물에 연결" onclick={() => { app.view = 'uv'; close(); }}>디자인 파일 {app.sources.length}</button>
      {#if app.selected && app.canEdit}<button class="btn small" data-testid="sync-link-selected" title="이 사인물에 디자인 파일 영역 연결" onclick={() => { app.view = 'uv'; close(); }}>고른 사인물에 연결</button>{/if}
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
  /* 버튼 상태 (2026-11-06): 만드는 중 스피너 · ✓ 완료 초록 · 실패 주황 */
  .saved { border: 1px solid var(--ok); border-radius: 10px; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .saved ul { margin: 0; padding-left: 18px; word-break: break-all; }
  .saved small { color: var(--muted); line-height: 1.45; }
  .btn.done { background: color-mix(in srgb, var(--ok) 22%, transparent); border-color: var(--ok); color: var(--text); }
  .btn.err { border-color: var(--warn); color: var(--warn); background: transparent; }
  .btn:disabled, .btn.off { opacity: 0.55; cursor: progress; }
  .btn.off { pointer-events: none; }
  .spin { display: inline-block; width: 11px; height: 11px; margin-right: 6px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: -1px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
