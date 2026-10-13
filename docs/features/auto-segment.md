# AI 자동 분리 (SAM)

## 요약
사진 위에 마우스를 올리면 그 자리의 물체(간판 자리, 창문, 벽면 등) 윤곽을 AI가 찾아 보여 주고, 클릭하면 **다각형 사인물**이 됩니다. AI는 "처음 인지"에만 쓰고, 이후 치수·견적·원근은 기존 규칙으로 처리합니다.

## 상태
구현됨 (1-5, 2026-10-13). 로컬에서 실제 추론으로 확인: 창문을 가리키면 창문, 간판 띠를 가리키면 띠 전체, 쇼윈도를 가리키면 쇼윈도가 잡힘(샘플 건물 사진). 모델 로드 + 1600px 사진 분석 + 첫 분리까지 약 7초(M-시리즈 Mac, WASM).

## 동작
- 도구: ✨ 자동(단축키 A, 편집 권한만). 도구를 고르면 **모델을 내려받고(처음 한 번, 약 14MB)** 보드의 사진을 분석합니다(사진당 한 번, CPU 에서 수 초~수십 초). 분석 중인 사진에는 "AI 가 사진을 분석하는 중…"이 보입니다.
- 분석이 끝난 사진 위에서 마우스를 움직이면(60ms 간격) 윤곽 미리보기가 파란색으로 뜨고, 클릭하면 사인물이 생깁니다(`shape: polygon`, `quad` = 외곽 사각형, `polygon` = 윤곽). 이후 모서리 편집·치수·시트 면적(다각형 면적)이 그대로 적용됩니다.
- 서버 주소가 없는 빌드(로컬 모드)에서는 도구가 숨겨집니다.

## 구성
| 부분 | 내용 |
|---|---|
| 모델 | SlimSAM-77 uniform, ONNX 양자화(`Xenova/slimsam-77-uniform`): 인코더 8.9MB + 디코더 4.9MB |
| 런타임 | Transformers.js(`@huggingface/transformers`) + onnxruntime-web(WASM). 워커(`src/lib/segment/worker.ts`)에서 실행 |
| 파일 호스팅 | 모델: 우리 R2 `models/slimsam/…` → `GET /api/models/*`(공개·장기 캐시). 업로드: `server/scripts/models.sh --local\\|--remote`. WASM 런타임: `npm run ort`가 `public/ort/`로 복사(외부 CDN 미사용) |
| 마스크 → 다각형 | `src/lib/core/mask.ts`: 가장 큰 연결 조각의 바깥 윤곽을 픽셀 모서리 좌표로 따라간 뒤 Douglas–Peucker 단순화(허용 오차 1.5px) |
| 메인 스레드 | `src/lib/segment/segmenter.ts`(모델 로드·임베딩·분리 요청), `state.svelte.ts`(`prepareSegment`, `segmentAt`, `createFromSegment`) |

## 규칙
- **좌표 변환**: 모델에 넘기는 점은 원본 px 가 아니라 **축소된 입력(긴 변 1024px) 좌표**입니다(`x × reshaped_w / original_w`). 빠뜨리면 약 1.56배 어긋난 엉뚱한 물체가 잡힙니다(실제 겪은 버그).
- 마스크는 SAM 이 돌려주는 3개 후보 중 IoU 점수가 가장 높은 것. 단 **사진의 90% 이상을 덮거나 비어 있는 후보는 제외**(`pickMask`) — 배경·건물 전체는 간판이 아니므로.
- 후보 마스크는 `post_process_masks` 결과 텐서(`[1, 3, H, W]`)의 `dims`·`data`에서 직접 잘라 씁니다(텐서에 `.map`을 쓰면 안 됨).
- 단색 합성 이미지에는 SAM 이 약합니다(전체를 한 덩어리로 봄). E2E 는 명암·창문이 있는 샘플 건물 사진을 씁니다.
- 호버 요청은 마지막 것만 반영(이전 응답은 버림).
- 임베딩은 워커 메모리에만 있고 저장하지 않습니다(새로고침하면 다시 분석).

## 관련 테스트
- `tests/unit/mask.test.ts`, `server/test/models.test.ts`, `tests/e2e/magic.spec.ts`(실제 추론, 최대 3분)

## 남은 일
- WebGPU 백엔드(지원 브라우저에서 수 배 빠름), 임베딩 캐시(IndexedDB), 클릭 여러 점으로 윤곽 보정
