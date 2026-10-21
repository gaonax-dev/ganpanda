-- 소비자 요청의 사업자등록증 사본 (2026-10-21 "사업자 사본 받아야 겠다"): R2 requests/<id>/biz-doc, 메타 JSON {type,size}. 제안을 보낸 간판사만 연다
ALTER TABLE requests ADD COLUMN biz_doc TEXT;
