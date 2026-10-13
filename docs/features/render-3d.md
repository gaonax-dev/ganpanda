# 입체 간판과 실사 렌더링

## 요약
4차(입체 간판): 채널 간판의 문구를 **실제 입체 글자(3D)**로 보여 주고, 폰트 기준 전체 폭을 치수에 넣습니다. 5차(실사 렌더링): 사진 속에 합성(주간 그림자·야간 발광)은 계획.

## 상태
- 4차 **구현됨** (2026-10-13)
- 5차 계획 — 초기 코드 `src/lib/sim/viewer.ts`(사진 배경 + 복원 카메라 + 그림자·블룸) 보관

## 입체 보기 (4차)
- 조건: 간판 종류가 **채널**이고 문구·글자 높이가 있을 때 사인물 설정 창([설정])에 [입체 보기 (3D)]가 나타납니다.
- 창(`src/lib/ui/Letter3DDialog.svelte`): Three.js 로 글자를 돌려 보고(OrbitControls) 주간/야간 전환, PNG 저장. 고객(viewer)도 열어 볼 수 있고 설정은 바꿀 수 없습니다.
- 글자: Pretendard Bold 윤곽(`core/textShapes.ts`) → `ExtrudeGeometry`(`sim/signs.ts`). 전광(`ch-front`)은 면 발광, 후광(`ch-halo`)은 벽면 반사 글로우, 그 외 비조명(`lightingOf`).
- 설정은 사인물 `letter3d { depthMm, faceColor, sideColor, letterSpacing }`에 저장(기본 두께 80mm). 바꾸면 모두에게 반영.
- **폰트 기준 폭**: 글자 높이·자간으로 조판한 전체 폭(mm)을 계산해 보여 주고(`measureTextWidthMm`), [가로 치수에 적용]으로 10mm 단위 반올림해 넣습니다 → 채널 견적의 근거가 됩니다.

## 관련 코드·테스트
- `src/lib/core/letter3d.ts`, `src/lib/ui/Letter3DDialog.svelte`, `src/lib/sim/signs.ts`, `src/lib/core/textShapes.ts`
- `tests/unit/letter3d.test.ts`, `tests/unit/channelGeometry.test.ts`, `tests/e2e/letter3d.spec.ts`

## 남은 일 (4차 보강)
- 글꼴 선택·TTF 업로드(현재 Pretendard Bold 고정), 박스 간판 3D, 측면 LED 색 분리
- 후광 글로우 번짐 폭·박스 야간 밝기 조정값은 아직 화면으로 확인하지 않음(초기 구현 시점 메모)

## 5차 계획
- `sim/viewer.ts`의 4점 보정 카메라(재투영 오차 0, `tests/unit/homography.test.ts`)로 사진 속 벽면 좌표에 입체 글자를 놓고, 주간 그림자·야간 LED 발광을 사진에 합성. 사진 보드에서 바로 확인.
- Three.js `PCFSoftShadowMap`은 제거되어 `PCFShadowMap`을 씁니다.
