// 채널 라이브러리 (2026-10-23 사용자: "간판 선택하고 채널 나오면 사용자들이 퀵으로 선택하고 여기에서 디테일을 추가하거나 빼는 방향으로").
// 15종 시안 사진(public/channel-types/NN.webp)을 고르면 그 채널 종류 + 옵션 묶음이 들어간다. 세부는 그다음 편집기에서 더하고 뺀다.
// 묶음은 지금 있는 옵션으로만 — 아직 없는 사양은 gap 에 적어 보여 준다(L3 이후 없음). 마감·띄움 거리·단차·갈바 앞면·전구 간격은 L2, 점등/비조명·일체형 측면 발광은 L3 (2026-10-23).
// "양면" = 앞면과 뒷면에서 동시에 빛이 나는 전후광 (2026-10-23 사용자: "전광과 후광을 같이 한걸로 보면된다").
// 고르기·적용은 종류와 무관하게 core/partPresets.ts (레지스트리 presets)
import type { PartPreset } from './components/types';

type Opts = Record<string, string | boolean>;

const color = (prefix: string, name: string): Opts => ({ [`${prefix}System`]: '기본색', [`${prefix}Code`]: name });
const P = (no: number, label: string, desc: string, type: string, options: Opts, gap?: string): PartPreset =>
  ({ no, label, desc, type, options, ...(gap ? { gap } : {}), img: `/channel-types/${String(no).padStart(2, '0')}.webp` });

export const CHANNEL_PRESETS: PartPreset[] = [
  P(1, '갈바 전면', '도장 갈바 전면 · 비조명 · 벽 부착', 'ch-galva', { chGalvaFace: '도장', chSideMat: '갈바', ...color('body', '검정') }),
  P(2, '알루미늄 채널 프레임', '헤어라인 알루미늄 측면 · 벽 부착', 'ch-front', { chSideMat: '알루미늄', chFinish: '헤어라인', ...color('face', '흰색') }),
  P(3, '벌브 채널', '전구 점등 · 벽 부착', 'ch-bulb', { ledColor: '전구색', chBulbPitch: '70mm', ...color('body', '빨강') }),
  P(4, '통아크릴 채널', '솔리드 아크릴 · 전체 발광 · 벽 부착', 'ch-acrylic', { ...color('face', '하늘') }),
  P(5, '양면 오사이 전후광', '전면 + 후광 · 까치발 띄움', 'ch-both', { chType: '오싸이', chSideMat: '스텐', ...color('body', '은색'), ...color('face', '흰색'), bracket: true, chStandoff: '40' }),
  P(6, '양면 캡 전후광', '골드 캡 · 전후광 · 까치발 띄움', 'ch-both', { chType: '캡', ...color('face', '흰색'), ...color('cap', '금색'), bracket: true, chStandoff: '40' }),
  P(7, '캡 전후광 채널', '레드 페이스 · 블랙 캡 · 까치발 띄움', 'ch-both', { chType: '캡', ...color('body', '검정'), ...color('face', '빨강'), ...color('cap', '검정'), bracket: true, chStandoff: '40' }),
  P(8, '아크릴 캡 단차 채널', '돌출 아크릴 페이스 · 벽 부착', 'ch-front', { chType: '캡 단차(아크릴)', chStep: '15', ...color('body', '검정'), ...color('face', '민트'), ...color('cap', '검정') }),
  P(9, '후광 채널', '백릿 · 벽면 간접광 · 까치발 띄움', 'ch-halo', { ledColor: '전구색', ...color('body', '갈색'), bracket: true, chStandoff: '50' }),
  P(10, '에폭시 채널', '에폭시 고광택 페이스 · 벽 부착', 'ch-galva', { chGalvaFace: '에폭시', chSideMat: '갈바', ...color('body', '파랑') }),
  P(11, '일체형 채널', '전면 · 측면 일체 발광 · 벽 부착', 'ch-front', { chType: '일체형', ...color('face', '분홍') }),
  P(12, '전광 채널', '화이트 전면 발광 · 컬러 측면 · 벽 부착', 'ch-front', { chType: '캡', ...color('body', '남색'), ...color('face', '흰색') }),
  P(13, '오사이 용접 채널', '미러 스테인리스 용접 · 벽 부착', 'ch-front', { chType: '오싸이', chBuild: '용접', chSideMat: '스텐', chFinish: '미러', chLight: '비조명', ...color('face', '은색') }),
  P(14, '캡용접 채널', '티타늄 골드 캡 용접 · 벽 부착', 'ch-front', { chType: '캡', chBuild: '용접', chSideMat: '스텐', chFinish: '티타늄 골드', ...color('face', '금색'), ...color('cap', '금색') }),
  P(15, '알루미늄 타카 채널', 'A/L 측면 · 아크릴 전면 점등 · 벽 부착', 'ch-front', { chType: '캡', chBuild: '타카', chSideMat: '알루미늄', ...color('body', '은색'), ...color('face', '아이보리') }),
];
