// 편집 층(외곽선·손잡이)을 화면 층에 그릴지 (2026-11-04 사용자: "외곽선 손잡이 선도 선명하게해줘" — 맥 앱(WebKit)에서만 보드 층이 낮은 해상도로 그려진다)
import { describe, expect, it } from 'vitest';
import { useScreenControls } from '../../src/lib/core/screenControls';

const MAC_APP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Ganpanda-App/0.1.0';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAC_EDGE = MAC_CHROME + ' Edg/130.0.0.0';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Ganpanda-App/0.1.0';

describe('useScreenControls', () => {
  it('맥 WebKit(앱·사파리)만 켜고, 크롬·엣지·아이폰은 끈다', () => {
    expect(useScreenControls(MAC_APP, 0)).toBe(true);
    expect(useScreenControls(MAC_SAFARI, 0)).toBe(true);
    expect(useScreenControls(MAC_CHROME, 0)).toBe(false);
    expect(useScreenControls(MAC_EDGE, 0)).toBe(false);
    expect(useScreenControls(IPHONE, 5)).toBe(false);
  });
  it('아이패드(맥처럼 보이는 사파리지만 터치)는 끈다 — 휴대 기기는 이동 중 다시 그리기를 피한다', () => {
    expect(useScreenControls(MAC_SAFARI, 5)).toBe(false);
  });
  it('설정값(시험·진단용)이 있으면 그것을 따른다', () => {
    expect(useScreenControls(MAC_CHROME, 0, '1')).toBe(true);
    expect(useScreenControls(MAC_APP, 0, '0')).toBe(false);
  });
});
