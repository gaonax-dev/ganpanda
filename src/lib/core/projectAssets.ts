// 프로젝트가 쓰는 파일(에셋) 목록 (2026-11-04 사용자: "저장공간이 부족해 사진을 업로드 하지 못했는데 유료로 전환했을때 누락 업로드를 서버로 다시 업로드 필요해"):
// 사진(조절 전 원본 포함)·디자인 소스 페이지·사인물의 그림(구성 요소·레이어 안 어디든)·대화 첨부. 구조가 여러 겹이라 값 안의 `assetId` 문자열을 모두 모은다 — 기기에만 있고 서버에 없는 것을 다시 올릴 때
export function projectAssetIds(p: { photos: unknown[]; sources: unknown[]; objects: unknown[]; messages: unknown[] }): string[] {
  const out = new Set<string>();
  const seen = new WeakSet<object>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 40 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'assetId' && typeof x === 'string' && x) out.add(x);
      else walk(x, depth + 1);
    }
  };
  walk([p.photos, p.sources, p.objects, p.messages], 0);
  return [...out];
}
