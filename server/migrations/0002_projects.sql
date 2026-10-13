-- 프로젝트(= 방)와 초대 링크 (1-2b)
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX projects_owner ON projects(owner_id);
-- 초대 링크: 토큰은 해시만. role = viewer(보기·대화만) | editor(편집)
CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX invites_project ON invites(project_id);
