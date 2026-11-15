# Hub tài liệu sale Capital Square

Mã nguồn của một trang nội bộ cho đội bán hàng dự án: bảng hàng, mặt bằng, chính sách, hỏi đáp. Trang chạy trên Cloudflare Pages; người dùng đăng ký bằng số điện thoại và phải được quản trị duyệt mới xem được dữ liệu.

Repo này **chỉ có mã**. Dữ liệu dự án, ảnh, bản build và cấu hình tài khoản không nằm ở đây.

## Cấu trúc

| Đường dẫn | Việc |
|---|---|
| `hub.html` | Giao diện một trang, không chứa dữ liệu |
| `worker/worker.tpl.js` | Khuôn Worker: đăng nhập, duyệt tài khoản và thiết bị, API trả dữ liệu theo vai |
| `build_site.py` | Bơm `data/*.json` vào khuôn Worker, ghi ra `site/`; có cổng chặn từ cấm và cổng cú pháp JS |
| `d1/schema.sql` | Bảng D1 |
| `tools/` | Tải giỏ hàng từ Google Drive, đọc chữ trên ảnh, dựng `data/` |
| `test_tro_ly.js`, `test_dang_nhap.mjs` | Bộ kiểm trợ lý hỏi đáp và luồng đăng nhập, phân quyền |

## Chạy trên máy mình

1. Chép `wrangler.mau.toml` thành `wrangler.toml`, `cau-hinh.mau.json` thành `cau-hinh.rieng.json`, rồi điền mã của mình.
2. Tự chuẩn bị thư mục `data/` (các file `toa.json`, `mat_bang.json`, `chinh_sach.json`, `kien_thuc.json`, `du_an.json`, `units.json`, `meta.json`, `kich_ban.json`). Thiếu file nào thì `build_site.py` dùng giá trị rỗng.
3. `python3 build_site.py` rồi `node test_tro_ly.js` và `node test_dang_nhap.mjs`. Hai bộ kiểm cần `data/` và `site/` đã dựng.
4. Đặt secret trên Cloudflare Pages: `ADMIN_KEY`, và nếu muốn nhận tin duyệt qua Telegram thì thêm `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Các script trong `tools/` viết cho đúng một nguồn giỏ hàng và một cách bố trí thư mục; dùng cho nguồn khác thì phải sửa.
