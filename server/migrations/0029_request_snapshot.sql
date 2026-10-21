-- 요청 = 견적 초안 방의 읽기 전용 복제 (2026-10-22 "이미 서버에 이미지가 있는데 이중으로 작동한다 … 그 상태를 요청페이지로 복제"):
-- 요청 프로젝트(projects.kind = 'request', 소유 = 가게 사장) id 와 그 사진들의 에셋 id JSON (간판집 목록 썸네일). 옛 요청은 null — requests/<id>/<n> 사진 그대로
ALTER TABLE requests ADD COLUMN snapshot_project TEXT;
ALTER TABLE requests ADD COLUMN snapshot_photos TEXT;
CREATE INDEX requests_snapshot ON requests(snapshot_project);
