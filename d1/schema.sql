-- Kho khách hub Capital Square (D1). Áp:  npx wrangler d1 execute csq-kho --remote --file d1/schema.sql
-- Mỗi SĐT khách = 1 dòng (sdt UNIQUE) → nạp trùng tự bỏ qua. Sale chỉ thấy dòng có sale_p = SĐT của mình.
CREATE TABLE IF NOT EXISTS khach (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sdt TEXT NOT NULL UNIQUE,          -- đã chuẩn hoá 0xxxxxxxxx
  ten TEXT,
  nguon TEXT,                        -- vd "File FBG 26/09", "Hub - đặt lịch"
  nhu_cau TEXT,
  ghi_chu_goc TEXT,                  -- ghi chú đi kèm lúc nạp (không sửa)
  sale_p TEXT,                       -- SĐT sale phụ trách (NULL = chưa giao)
  trang_thai TEXT NOT NULL DEFAULT 'moi',
  ghi_chu TEXT,                      -- ghi chú mới nhất của sale
  hen_lai TEXT,                      -- YYYY-MM-DD hẹn gọi lại
  lan_cham INTEGER NOT NULL DEFAULT 0,
  cham_cuoi TEXT,
  lo_nap TEXT,                       -- mã lô nạp
  tao TEXT NOT NULL,
  sua TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_khach_sale ON khach(sale_p, trang_thai);
CREATE INDEX IF NOT EXISTS ix_khach_hen ON khach(sale_p, hen_lai);
CREATE TABLE IF NOT EXISTS lich_su (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  khach_id INTEGER NOT NULL,
  sale_p TEXT,
  loai TEXT NOT NULL,                -- nap | giao | trang-thai | ghi-chu | hen-lai | dat-lich
  noi_dung TEXT,
  luc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ls_khach ON lich_su(khach_id);
