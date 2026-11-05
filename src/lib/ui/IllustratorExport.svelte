<!-- 일러스트 대지 — 디자인 탭 막대 (2026-11-05): [대지 받기 (zip)] · [설치용 스크립트 받기 (간판다.jsx)] + 설치 안내.
     "가볍게 일러스트에 스크립트 설치하고 실행하면 폴더 선택가능하게 파인더 띄워주고 가는건" → 설치형은 폴더를 골라 ganpanda.json 을 읽는다 → docs/features/illustrator.md -->
<script lang="ts">
  import { app } from '../state.svelte';
  import { downloadIllustratorScript, exportIllustrator } from '../illustratorExport';

  let open = $state(false);
  let busy = $state(false);
  async function zip() {
    if (busy) return;
    busy = true;
    try { if (!(await exportIllustrator())) app.notice = '치수가 있는 사인물 카드가 없습니다.'; else open = false; }
    catch (e) { app.notice = `일러스트 대지를 만들지 못했습니다: ${e instanceof Error ? e.message : e}`; }
    finally { busy = false; }
  }
</script>

<span class="wrap">
  <button data-testid="export-illustrator" title="일러스트레이터 대지 — 사인물마다 대지·구성 요소 레이어, 디자인 뒤 간판다로 보내기" onclick={() => (open = !open)}>{app.compact ? '일러스트' : '일러스트 대지 받기'}</button>
  {#if open}
    <div class="opts" data-testid="illustrator-options">
      <b>일러스트 대지</b>
      {#if app.unconfirmedCount}<small class="unconfirmed" data-testid="unconfirmed-warning">⚠ 고객 컨펌 뒤 바뀐 사인물 {app.unconfirmedCount}개 — 이 파일은 지금 내용입니다. 변경 견적을 발행해 고객이 컨펌한 뒤 출력하세요(견적 탭 [바뀐 내용]).</small>{/if}
      <button class="primary" data-testid="illustrator-download" disabled={busy} onclick={zip}>{busy ? '만드는 중…' : '대지 받기 (zip)'}</button>
      <small class="tip">zip 을 풀면 프로젝트 이름 폴더(ganpanda.json · images · ganpanda.jsx)가 됩니다.</small>
      <button data-testid="illustrator-script" onclick={() => { downloadIllustratorScript(); }}>설치용 스크립트 받기 (간판다.jsx)</button>
      <small class="tip" data-testid="illustrator-install-tip">한 번만: 받은 <b>간판다.jsx</b> 를 일러스트 스크립트 폴더(맥: 응용 프로그램 › Adobe Illustrator › Presets › ko_KR › 스크립트, 윈도우: Program Files › Adobe › Adobe Illustrator › Presets › ko_KR › 스크립트)에 넣고 일러스트를 다시 켜면 <b>파일 › 스크립트 › 간판다</b>. 실행하면 폴더를 고르는 창이 뜹니다 — 받은 폴더를 고르면 대지가 생기고, 작업한 문서를 연 채 실행하면 <b>간판다로 보내기</b>. 설치 없이 쓰려면 폴더 안 ganpanda.jsx 를 <b>파일 › 스크립트 › 기타 스크립트…</b> 로.</small>
    </div>
  {/if}
</span>

<style>
  .opts .unconfirmed { color: #fb923c; line-height: 1.4; }
  .wrap { position: relative; display: inline-flex; }
  .opts { position: absolute; left: 0; top: 100%; margin-top: 4px; z-index: 20; width: min(380px, calc(100vw - 24px)); background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); }
  .opts small { color: var(--muted); line-height: 1.4; }
  .opts .tip b { color: var(--text); }
  .opts button { text-align: left; }
  @media (max-width: 720px) { .opts { position: fixed; left: 12px; right: 12px; top: auto; width: auto; } }
</style>
