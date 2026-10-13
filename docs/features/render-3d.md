# 입체 간판과 실사 렌더링

## 상태
계획 (4차·5차). 초기 코드가 `src/lib/sim/`에 보관되어 있습니다. 현재 앱에는 연결되어 있지 않습니다.

## 보관 중인 초기 구현
| 파일 | 내용 |
|---|---|
| `sim/viewer.ts` | Three.js 뷰어: 사진 배경, 4점 보정으로 복원한 카메라, 주간 그림자(ShadowMaterial), 야간 블룸 |
| `sim/signs.ts` | 채널 입체 글자(ExtrudeGeometry, 전광·후광·비조명), 후광 글로우, 박스 간판 |
| `sim/sample.ts` | 원근이 있는 합성 건물 사진 (테스트·데모용) |
| `core/textShapes.ts` | 폰트(Pretendard 번들 또는 TTF/OTF) 글리프 → 구멍 포함 도형 |

## 검증된 것
- 카메라 포즈 복원은 합성 카메라 기준 재투영 오차 0px (`tests/unit/homography.test.ts`)
- 입체 글자 높이·폭·두께가 mm 입력과 일치 (`tests/unit/channelGeometry.test.ts`)

## 알려진 한계
- 후광 글로우 번짐 폭과 박스 간판 야간 밝기의 마지막 조정은 화면으로 확인하지 못했습니다.
- Three.js `PCFSoftShadowMap`은 제거되어 `PCFShadowMap`을 씁니다.
