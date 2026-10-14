# 입체 간판과 실사 렌더링

## 요약
4차(입체 간판): 채널 간판의 문구를 **실제 입체 글자(3D)**로 보여 주고, 폰트 기준 전체 폭을 치수에 넣습니다. 5차(실사 렌더링): 사진 속 벽면에 사인물을 합성해 주간 그림자·야간 발광을 바로 확인하고 PNG 로 저장합니다.

## 상태
- 4차 **구현됨** (2026-10-13)
- 5차 **구현됨** (2026-10-13) — 사진 보드 사진 이름 바의 [🧊 3D] (2026-10-14 "3D 뷰"로: 사인물이 없어도 열림)

## 입체 보기 (4차)
- 조건: 간판 종류가 **채널**이고 문구·글자 높이가 있을 때 사인물 설정 창([설정])에 [입체 보기 (3D)]가 나타납니다.
- 창(`src/lib/ui/Letter3DDialog.svelte`): Three.js 로 글자를 돌려 보고(OrbitControls) 주간/야간 전환, PNG 저장. 고객(viewer)도 열어 볼 수 있고 설정은 바꿀 수 없습니다.
- 글자: Pretendard Bold 윤곽(`core/textShapes.ts`) → `ExtrudeGeometry`(`sim/signs.ts`). 전광(`ch-front`)은 면 발광, 후광(`ch-halo`)은 벽면 반사 글로우, 그 외 비조명(`lightingOf`).
- 설정은 사인물 `letter3d { depthMm, faceColor, sideColor, letterSpacing }`에 저장(기본 두께 80mm). 바꾸면 모두에게 반영.
- **폰트 기준 폭**: 글자 높이·자간으로 조판한 전체 폭(mm)을 계산해 보여 주고(`measureTextWidthMm`), [가로 치수에 적용]으로 10mm 단위 반올림해 넣습니다 → 채널 견적의 근거가 됩니다.

## 관련 코드·테스트
- 4차: `src/lib/core/letter3d.ts`, `src/lib/ui/Letter3DDialog.svelte`, `src/lib/sim/signs.ts`, `src/lib/core/textShapes.ts` / `tests/unit/letter3d.test.ts`, `tests/unit/channelGeometry.test.ts`, `tests/e2e/letter3d.spec.ts`
- 5차: `src/lib/core/wallPlane.ts`, `src/lib/core/render.ts`, `src/lib/ui/RenderDialog.svelte`, `src/lib/sim/viewer.ts` / `tests/unit/wallPlane.test.ts`, `tests/unit/renderSpec.test.ts`, `tests/e2e/render.spec.ts`(합성 사진에서 글자 위치 픽셀·야간 밝기·PNG 해상도)

## 남은 일
- 5차 보강: 실사 PNG 를 대화에 바로 첨부, 태양 방향(시간대) 조절, 사진 색감에 맞춘 톤 보정, 벽면이 여러 개인 사진(옆면 벽), 원형·다각형 사인물의 정확한 윤곽, 핀홀과 맞지 않는 사진의 잔차 보정
- 4차 보강: 글꼴 선택·TTF 업로드(현재 Pretendard Bold 고정), 측면 LED 색 분리
- 후광 글로우 번짐 폭·박스 야간 밝기 조정값은 아직 화면으로 확인하지 않음(초기 구현 시점 메모)

## 3D 뷰 (5차 실사 보기 → 2026-10-14 사용자: "우선 3D 뷰가 있어야 한다, 사진마다 3D 가능한지 먼저 확인")
- 사진마다 이름 바에 **[🧊 3D]**(`render-open`, `data-status` = `ok`/`none`): 원근 설정이 있거나 치수를 입력한 사인물이 있으면 ✓(`app.threeDOk`). 사인물이 없어도 열리고, 벽면 격자(1m)·원점 축·1m 상자를 사진 위에 그려 **이 사진의 3D 가 맞는지** 먼저 확인합니다. 3D 가 안 되는 사진은 이유와 [원근 맞추기] 버튼(`render-open-camera`)을 보여 줍니다. → `RenderDialog.svelte`(`app.renderPhotoId`). 주간/야간, 벽면 격자, [PNG 저장](원본 해상도, 긴 변 4096 제한). Esc·바깥 클릭으로 닫힘.
- **벽면 좌표계** (`src/lib/core/wallPlane.ts`): 사진 px ↔ 벽면 mm(X 오른쪽, Y 위, 원점 = 영역들의 좌하단).
  - **카메라 설정**이 있는 사진 → 그 벽면(`calibrationOf` → `Calibration.H`). 축 방향은 첫 영역의 TL→TR 이 +x, BL→TL 이 +y 가 되게 맞춥니다.
  - 카메라 보정은 `metric: true` — 사진 px → 벽 mm 가 원점·방향까지 맞아 사인물 없이도 벽면이 됩니다(원근 창의 3D 겹침과 같은 격자).
  - 아니면 **치수를 입력한 첫 영역**을 벽면 기준(실측 판독과 같은 규칙). 둘 다 없으면 "이 사진은 아직 3D 를 만들 수 없습니다 — 원근 맞추기 또는 치수 입력".
  - `placeOnWall`: 영역 사각형 → 벽면 중심·크기(위·아래 변 평균 = 가로, 좌·우 변 평균 = 세로). 원형·다각형도 외곽 사각형으로.
  - `poseOfPlane`: 벽면 4000mm 정사각형의 사진 투영 → 초점거리 추정(`estimateFocal`, 실패 시 장변×0.75) → `recoverPose`. 핀홀 카메라와 맞는 사진이면 벽 위 점이 1px 안에 제자리에 투영됩니다(단위 테스트). 손으로 그린 합성 사진(`sim/sample.ts`)처럼 핀홀과 맞지 않으면 몇 % 어긋날 수 있습니다.
- **사인물 → 3D 사양** (`src/lib/core/render.ts` `renderSpecOf`): 채널 제품 + 문구 = 입체 글자(글자 높이 = 영역 세로, 4차의 두께·색·자간 설정 사용, 전광·후광 조명). 그 외 = 박스(`lightboxGeometry`: `corner` 가 있으면 둥근 사각형을 밀어낸 형상, 면 이미지 UV 는 repeat/offset 으로 0~1 맞춤): 보드는 제품별 바탕색·두께(포맥스 10 / 복합판·아크릴·갈바 100 / 플렉스 150, 플렉스만 발광), 시트만이면 2mm 얇은 면. 문구가 있으면 면에 글자, **입힌 디자인(UV 뷰)**이 있으면 그 이미지를 면에 붙입니다(`buildLightbox(spec, font, face)`). 분류 없는 사인물은 그리지 않습니다.
- 합성: `sim/viewer.ts` — 사진을 배경 셰이더로, 복원 카메라, 벽면 그림자 받는 투명 평면(`ShadowMaterial`), 야간은 배경을 어둡게·태양 끄고·블룸(`UnrealBloomPass`). 사인물·소스·보정이 바뀌면 다시 합성(마지막 요청만 반영하는 토큰).
- 테스트 훅: 저장한 PNG 데이터 URL 은 `app.lastRender`(E2E 에서 픽셀 검사).
- Three.js `PCFSoftShadowMap`은 제거되어 `PCFShadowMap`을 씁니다.
