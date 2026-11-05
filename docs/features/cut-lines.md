# 칼선 SVG (roadmap 10-2, 1차 구현됨 2026-11-05)

> 사용자: "내가 구상하는 최종 목표는 실측에서 출력소까지 하나의 보드에서 해결하는 거야" → "진행해줘".
> 채널·스카시 같은 입체 사인물은 글자를 잘라 만든다. 3D 에 쓰는 바로 그 윤곽을 커팅 플로터·레이저가 읽는 칼선 파일로 낸다.

## 어디서
디자인 탭 막대 [SVG] 창 → **[칼선 SVG]** (`cut-download`). 파일 이름 `<프로젝트> 칼선 1-1.svg`.
고객 컨펌 전 변경안이 있으면 창의 경고(10-0)가 함께 보인다 — 칼선도 지금 내용이다.

## 무엇이 들어가나
- **3D 에서 밀어내는(입체) 구성 요소**(종류 모듈 `extrude` — 채널·스카시)의
  - 글자 객체: 폰트(Pretendard Bold) 윤곽을 **3D 와 같은 규칙**으로 글자 상자에 맞춘다 — 폰트 크기 = 상자 높이 90%, 폭 = 상자 폭 96%, 세로 중심 = 글자 상자(어센더~디센더) 가운데 (`channelGeometry` fitBox 와 같음).
  - 일러스트에서 온 **벡터 그림 객체**(`vector`, [illustrator.md](illustrator.md)): 채운 패스 윤곽 그대로(객체 상자 크기).
- 시트·인쇄 글자·그림·도형은 **빠진다**(칼선이 아님). 레이어 트리의 숨긴 층도 빠진다.
- 칼선을 낼 것이 하나도 없으면 내려받지 않고 알린다.

## 파일 모양
- 1 단위 = 1mm, `width`/`height` 는 `mm`. 사인물 카드는 **보드 평면 구역 배치(flatPlaced) 그대로** — 전개도 SVG 와 같은 자리.
- `<g id="CutContour">` — 자를 선만: 마젠타(`#ff00ff`) 0.25mm 선, 채움 없음, `fill-rule="evenodd"`. 글자 객체 하나 = path 하나(바깥 + 구멍).
  커팅·RIP 프로그램 관례(CutContour 이름의 레이어·별색)에 맞춘 것. 일러스트 별색 지정은 다음.
- `<g id="Labels">` — 사인물 자리 점선 사각형과 이름(회색). 자르지 않는 참고 레이어.
- 추정 크기 카드는 그 크기로 줄이고 늘인다(3D `composedOf` 와 같은 축척).

## 코드
- `src/lib/core/cutlines.ts` — `textCutShapes`(글자 → mm 윤곽), `shapePathD`(윤곽 → path), `cutItems`(칼선 낼 객체), `cutSvg`(한 장)
- `src/lib/cutExport.ts` — 보드 카드 배치·폰트·벡터(`loadItemVectors`)를 모아 SVG
- 테스트: `tests/unit/cutlines.test.ts`, `tests/e2e/cutlines.spec.ts`

## 남은 것
- 일러스트 스크립트 쪽 CutContour 별색(spot) 견본, 코렐 매크로
- 사인물별 칼선 파일·옵셋(채널 옆판 접기 여유 등 가공별 오프셋)
