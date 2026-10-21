// 방 복제 (2026-10-22 사용자: "그 상태를 요청페이지로 복제해 놓는건 어떤가?" → "복제해서 자기 프로젝트로 가져오는건 옵션으로"):
// 문서(Yjs)를 다른 방으로 옮기고, 사진·파일 에셋은 다시 올리지 않고 새 소유 계정에 등록만 한다 (에셋은 내용 해시 id 로 R2 에 하나)
export interface CloneResult { assets: string[]; photoAssets: string[] }

export async function cloneRoom(env: Env, from: { id: string; owner_id: string }, to: { id: string; owner_id: string }, maps: string[], dropSettings: string[] = []): Promise<CloneResult> {
  const update = await env.ROOM.getByName(from.id).exportState();
  const res = await env.ROOM.getByName(to.id).cloneFrom(update, maps, dropSettings);
  if (from.owner_id !== to.owner_id && res.assets.length) {
    const rows = await env.DB.prepare(`SELECT asset_id, size FROM account_assets WHERE account_id = ? AND asset_id IN (${res.assets.map(() => '?').join(',')})`).bind(from.owner_id, ...res.assets).all<{ asset_id: string; size: number }>();
    const now = Date.now();
    if (rows.results.length) await env.DB.batch(rows.results.map((r) => env.DB.prepare('INSERT OR IGNORE INTO account_assets (account_id, asset_id, size, created_at) VALUES (?, ?, ?, ?)').bind(to.owner_id, r.asset_id, r.size, now)));
  }
  return res;
}
