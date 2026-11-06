// 일러스트레이터 스크립트 내려받기 (2026-11-05 "가장 나이스한건 일러스트 플러그인을 개발하고 우리 포맷을 일러스트에서 재구성하는 거야" → 디자인 탭 [일러스트], "견적탭에서 디자인으로 이동해줘").
// 카드 배치(mm)와 카드마다 최종 이미지(2026-11-06 정의 — 디자인 > 2D 속성 내용 > 사진)를 담는다. 일러스트에서 실행하면 사인물마다 대지 + 받은 이미지·디자인·path 레이어 → docs/features/illustrator.md
import { app } from './state.svelte';
import { cardFinalPng } from './render/cardImage';
import { artNumbers, illustratorPackage, jsxWithData, type IllustratorCardIn } from './core/illustrator';
import { zipStore } from './core/zip';
import illustratorJsx from './illustrator/ganpanda.jsx?raw';

const safe = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * 치수 있는 카드(임시 크기 제외)로 일러스트 묶음 zip 을 내려받는다: ganpanda.jsx + ganpanda.json + images/<id>.png(최종 이미지). 카드가 없으면 false.
 * 그림은 스크립트 안에 넣지 않고 파일로 — 일러스트가 연결만 한다 (2026-11-05 "5분정도 걸린다. 차라리 이미지들을 따로 폴더에 넣고 연결하는게 좋을 거 같은데").
 * zip 안 이름은 영문만(윈도우 기본 압축 풀기에서 한글 이름이 깨지지 않게), 풀면 zip 이름(프로젝트명) 폴더가 된다
 */
export async function exportIllustrator(): Promise<boolean> {
  const cards: IllustratorCardIn[] = [];
  const files: { name: string; data: Uint8Array }[] = [];
  const addFile = (name: string, data: Uint8Array | null) => { if (!data) return undefined; files.push({ name, data }); return name; };
  // 대지 번호 (2026-11-06 "대지 #id로 추적하고 프로젝트명+숫자 간단하게" → "번호 규칙은 1부터 새로생기면 증분 사라지면 영구결번"):
  // 번호 없는 사인물에 만든 순서대로 매기고, 지금까지 매긴 가장 큰 번호(artNoLast)와 함께 저장 — 지운 사인물의 번호는 다시 쓰지 않는다
  const byCreated = app.flatCards.filter((c) => !c.placeholder).map((c) => c.o).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const { nos, added, last } = artNumbers(byCreated, app.settings.artNoLast ?? 0);
  if (added.length && app.canEdit) {
    app.editBoundary();
    for (const a of added) app.project.updateObject(a.id, { artNo: a.no });
    app.updateSettings({ artNoLast: last });
    app.editBoundary();
  }
  for (const { o, w, h, placeholder } of app.flatCards) {
    if (placeholder) continue;
    const p = app.flatPlaced.get(o.id);
    if (!p) continue;
    // 받은 이미지 = 카드의 최종 그림 (2026-11-06 정의 "보내기는 위의 순서로 최종(3d제외) 이미지로 보낸다") — render/cardImage
    const png = await cardFinalPng(o, w, h).catch(() => null);
    const image = png ? addFile(`images/${safe(o.id)}.png`, new Uint8Array(await png.arrayBuffer())) : undefined;
    cards.push({ id: o.id, no: nos.get(o.id), name: o.name, x: p.x, y: p.y, w, h, ...(image ? { image } : {}) });
  }
  if (!cards.length) return false;
  const project = app.access.status === 'ok' ? app.access.projectName : '간판다';
  const pkg = illustratorPackage({ project, cards });
  const jsx = jsxWithData(illustratorJsx, pkg);
  app.lastIllustrator = jsx;
  // ganpanda.json = 설치형 스크립트(간판다.jsx)가 폴더를 골라 읽는 데이터, ganpanda.jsx = 설치 없이 바로 실행 (2026-11-05)
  const zip = zipStore([{ name: 'ganpanda.jsx', data: new TextEncoder().encode(jsx) }, { name: 'ganpanda.json', data: new TextEncoder().encode(JSON.stringify(pkg)) }, ...files]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
  a.download = `${project} 일러스트 대지.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return true;
}

/**
 * 설치용 스크립트 (2026-11-05 "가볍게 일러스트에 스크립트 설치하고 실행하면 폴더 선택가능하게 파인더 띄워주고 가는건"): 데이터 없는 간판다.jsx —
 * 일러스트 스크립트 폴더에 한 번 넣으면 파일 › 스크립트 › 간판다. 실행하면 받은 폴더를 고르고(ganpanda.json), 간판다 대지 문서를 연 채면 보내기
 */
export function downloadIllustratorScript() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([illustratorJsx], { type: 'application/javascript' }));
  a.download = '간판다.jsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
