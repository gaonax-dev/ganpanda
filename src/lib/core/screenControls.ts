// 편집 층(사인물 외곽선·손잡이·매니퓰레이터 SVG)을 확대되는 보드 밖 화면 층에 그릴지 (2026-11-04 사용자: "외곽선 손잡이 선도 선명하게해줘").
// 실제 맥 앱(Tauri WKWebView)에서 사진이 여럿인 보드를 확대하면 확대되는 보드 층 전체를 낮은 해상도로 그려 선·손잡이가 흐려졌다(아이폰·크롬은 괜찮다).
// 화면 층에 그리면 선명하지만 화면을 움직일 때마다 다시 그리므로, 문제가 있는 맥 WebKit(앱·사파리)에서만 켠다. 터치 기기(아이패드 포함)는 끈다.
// override = localStorage 'ganpanda.screenCtl' ('1' 켬 / '0' 끔, 시험·진단용)
export function useScreenControls(ua: string, maxTouchPoints: number, override?: string | null): boolean {
  if (override === '1') return true;
  if (override === '0') return false;
  if (maxTouchPoints > 0) return false;
  if (!/Macintosh/.test(ua) || !/AppleWebKit/.test(ua)) return false;
  return !/Chrome\/|Chromium|Edg\/|Firefox/.test(ua);
}
