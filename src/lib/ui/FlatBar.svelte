<!-- 정면도 카드 배열(대지) 도구 막대 — 배열 모드일 때 하단 도구 막대 바로 위 (2026-10-26 "대지 제어툴바 하단으로 이동시켜줘";
  2026-10-23 "글과 버튼들을 상단 헤더의 창으로 이동해줘 여기에 정면도 사인물 고정 토글버튼도"의 상단 헤더 자리는 대체됨).
  같은 날 "재정렬, 간격, 비율,고정 만 보이게 그리고 간격과 비율의 +-는 버튼으로 디자인 변경해줘": [완료]는 뺌(빈 곳을 탭하면 끝), −/+ 는 테두리 있는 단추 -->
<script lang="ts">
  import { app } from '../state.svelte';
</script>

<div class="flatbar" data-testid="flat-bar" title="정면도 카드 배열 — 카드는 끌어서 배치(리스트와 같은 배치). 빈 곳을 탭하면 끝">
  <button class="act primary" data-testid="flat-rearrange" title="사진 구도대로 다시 배열 — 카드는 사진 바로 아래, 사진 속 간격대로" onclick={() => app.arrangeFlatCards()}>재정렬</button>
  <span class="grp" title="카드 간격 (mm) — 바꾸면 그 간격으로 다시 배열">
    <span class="lbl">간격</span>
    <button class="step" data-testid="flat-gap-down" aria-label="간격 줄이기" onclick={() => app.setFlatGap(app.flatGap - 50)}>−</button>
    <span class="val" data-testid="flat-gap-value">{app.flatGap}</span>
    <button class="step" data-testid="flat-gap-up" aria-label="간격 늘리기" onclick={() => app.setFlatGap(app.flatGap + 50)}>+</button>
  </span>
  <span class="grp" data-testid="flat-scale" title="카드 비율(대지 전체 크기, 모두에게 같음)">
    <span class="lbl">비율</span>
    <button class="step" data-testid="flat-scale-down" aria-label="비율 줄이기" onclick={() => app.scaleFlat(1 / 1.25)}>−</button>
    <span class="val" data-testid="flat-scale-value">{Math.round((app.flatScale / 0.1) * 100)}%</span>
    <button class="step" data-testid="flat-scale-up" aria-label="비율 키우기" onclick={() => app.scaleFlat(1.25)}>+</button>
  </span>
  <button class="act" data-testid="flat-lock" class:on={app.flatLocked} title={app.flatLocked ? '고정 풀기 — 카드를 끌어 옮길 수 있게' : '고정 — 카드를 끌어도 움직이지 않게 (모두에게 같음)'} onclick={() => app.setFlatLocked(!app.flatLocked)}>{app.flatLocked ? '🔒' : '🔓'}<span class="locktxt"> 고정</span></button>
</div>

<style>
  .flatbar {
    position: absolute; left: 50%; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 6;
    display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 12px; white-space: nowrap;
    background: var(--panel); border: 1px solid var(--accent); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }
  button { font: inherit; cursor: pointer; color: var(--text); }
  .act { background: none; border: 1px solid var(--line); border-radius: 8px; padding: 0 12px; height: 34px; font-size: 13px; font-weight: 600; }
  .act:hover { border-color: var(--accent); }
  .primary, .act.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .grp { display: inline-flex; align-items: center; gap: 4px; }
  .lbl { font-size: 12px; color: var(--muted); margin-right: 2px; }
  .val { min-width: 40px; text-align: center; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .step {
    width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
    background: var(--input); border: 1px solid var(--line); border-radius: 8px; font-size: 18px; font-weight: 700; line-height: 1;
  }
  .step:hover { border-color: var(--accent); color: var(--accent); }
  .step:active { background: color-mix(in srgb, var(--accent) 25%, var(--input)); }
  /* 휴대폰: 하단 막대(bottom 8px) 바로 위, 화면 폭에 맞춰 가로 스크롤 — 단추는 손가락 크기 */
  @media (max-width: 720px) {
    /* 한 화면에 다 들어가게 (390px 폭): 단추 36px, [고정]은 자물쇠만 */
    .flatbar { left: 8px; right: 8px; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); transform: none; overflow-x: auto; scrollbar-width: none; justify-content: space-between; gap: 4px; padding: 5px 6px; }
    .step, .act { height: 36px; }
    .step { width: 32px; font-size: 17px; }
    .act { padding: 0 9px; }
    .grp { gap: 2px; }
    .lbl { font-size: 11px; margin-right: 1px; }
    .val { min-width: 30px; font-size: 11px; }
    .locktxt { display: none; }
  }
</style>
