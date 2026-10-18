# 코드·문서 규칙

## 코드
- 순수 로직은 `src/lib/core/`에 둡니다. DOM·Svelte를 import하지 않습니다.
- 화면 문구와 주석은 한국어로 씁니다.
- **입력 필드는 가로 한 줄**(2026-10-18 사용자: "체크박스와 라벨 입력필드가 세로배치된것이 많은데 자리도 많이 차지하고 헷갈려"): 라벨 왼쪽·컨트롤 오른쪽(`display:flex; align-items:center`), 라디오·체크박스 묶음은 한 줄에 나란히(긴 설명은 `title`로). 세로로 쌓는 것은 textarea 처럼 높이가 큰 컨트롤뿐.
- 단위를 변수 이름에 드러냅니다 (`widthMm`, `imgW`). 단위 규칙 → [../architecture/coordinates.md](../architecture/coordinates.md)
- 호모그래피를 계산하는 곳은 찌그러진 사각형 예외를 처리합니다.
- Yjs 문서를 바꿀 때는 `Project` 메서드를 거칩니다. 엔티티는 중첩 `Y.Map`으로 저장합니다 → [../architecture/data-model.md](../architecture/data-model.md)
- 단가·한도·허용 오차 같은 숫자는 이름 있는 상수로 둡니다.
- 외부 CDN과 원격 폰트를 쓰지 않습니다 (Tauri 오프라인 동작).

## 커밋
- 커밋 메시지는 한국어로 씁니다. 첫 줄에 요약을 적습니다.
- 코드 변경과 관련 문서 변경을 같은 커밋에 넣습니다.

## 문서
- 문서 구조와 작성 규칙 → [../README.md](../README.md)
- 사용자와 새로 합의한 사항은 [../product/decisions.md](../product/decisions.md)에 날짜와 함께 추가합니다.
