// 사진 이름 (2026-10-20 사용자: "이미지 이름이 모두 같아 사진 올리면 프로젝트면+_img_#으로 이름올려줘 #은 번호")
// 휴대폰 사진은 대개 image.jpg 로 올라와 사진을 구분할 수 없었다 → "프로젝트 이름_img_번호".
// 번호 = 이미 있는 "_img_번호" 중 가장 큰 것 + 1 (지운 사진 번호를 다시 쓰지 않고, 프로젝트 이름을 바꿔도 이어진다)
export function nextPhotoName(projectName: string, existing: string[]): string {
  const base = projectName.trim() || '사진';
  const max = existing.reduce((m, n) => { const r = /_img_(\d+)$/.exec(n); return r ? Math.max(m, Number(r[1])) : m; }, 0);
  return `${base}_img_${max + 1}`;
}
