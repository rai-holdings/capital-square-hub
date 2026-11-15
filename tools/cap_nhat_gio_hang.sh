#!/bin/bash
# CẬP NHẬT GIỎ HÀNG (1 lệnh): tải file FBG mới nhất từ Drive → ảnh phiếu/chỉ căn mới → OCR → dựng dữ liệu tất cả dự án
# → build → 2 bộ test → deploy NẾU dữ liệu đổi.
#   bash tools/cap_nhat_gio_hang.sh            chỉ dựng + test (không deploy)
#   bash tools/cap_nhat_gio_hang.sh --deploy   deploy khi dữ liệu/ảnh đổi so với lần deploy trước
#   bash tools/cap_nhat_gio_hang.sh --ep       deploy luôn (ép)
# Lịch tự chạy 09:00 hằng ngày: ~/Library/LaunchAgents/com.rai.csq-gio-hang.plist · log ~/Library/Logs/csq-gio-hang.log
# Test đỏ → DỪNG, không deploy (bản đang chạy trên mạng giữ nguyên), ghi ❌ vào log.
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")/.."
export KHO_HUONG_BRAIN="${KHO_HUONG_BRAIN:-$HOME/Hường Brain}"   # raw/ vẫn nằm ở kho chính (tách repo 15/11/2026)
LUC() { date '+%Y-%m-%d %H:%M'; }
trap 'echo "$(LUC) ❌ DỪNG ở dòng $LINENO — không deploy"' ERR
OCR="$HOME/.cache/csq-ocr/ocr"
[ -x "$OCR" ] || { mkdir -p "$(dirname "$OCR")"; swiftc -O tools/ocr.swift -o "$OCR"; }
OUT="$(python3 tools/tai_file_gio_hang.py)"
XLSX="$(printf '%s\n' "$OUT" | sed -n 1p)"; NGAY="$(printf '%s\n' "$OUT" | sed -n 2p)"   # đường dẫn có dấu cách (Hường Brain) → KHÔNG dùng read tách theo khoảng trắng
echo "$(LUC) ▶ File giỏ hàng: $(basename "$XLSX") (sửa $NGAY)"
python3 tools/tai_anh_gio_hang.py "$XLSX" >/dev/null
find "$KHO_HUONG_BRAIN/raw/assets/capital-square/gio-hang" -type f \( -iname '*.jpg' -o -iname '*.png' \) | while read -r f; do
  t="${f%.*}.ocr.txt"; [ -s "$t" ] || "$OCR" "$f" > "$t"; done
python3 tools/doc_gio_hang.py "$XLSX" "$NGAY" | head -1
python3 tools/doc_gio_hang_tat_ca.py "$XLSX" "$NGAY" >/dev/null
python3 build_site.py | tail -1 && python3 build_site.py --xem-thu >/dev/null
TL="$(node test_tro_ly.js | head -1)"; echo "  trợ lý: $TL"
case "$TL" in *"trượt 0, nhầm 0"*) ;; *) echo "$(LUC) ❌ Test trợ lý đỏ — không deploy"; exit 1;; esac
perl -e 'alarm 180; exec @ARGV' node test_dang_nhap.mjs > /tmp/csq-test.out 2>/dev/null || { echo "$(LUC) ❌ Test đăng nhập đỏ — không deploy"; grep '❌' /tmp/csq-test.out | head -5; exit 1; }
echo "  đăng nhập: $(tail -1 /tmp/csq-test.out)"
# dấu vân tay dữ liệu + ảnh → so với lần deploy trước
VAN_TAY="$( (cat data/units.json data/du_an.json; find anh-nguon -type f -exec shasum {} \; | sort) | shasum | cut -c1-16)"
CU="$(cat .van-tay-deploy 2>/dev/null || true)"
if [ "${1:-}" = "--ep" ] || { [ "${1:-}" = "--deploy" ] && [ "$VAN_TAY" != "$CU" ]; }; then
  CLOUDFLARE_ACCOUNT_ID="$(python3 -c 'import sys;sys.path.insert(0,"tools");from cau_hinh import CAU_HINH;print(CAU_HINH["cloudflare_account_id"])')" npx wrangler pages deploy --branch main --commit-dirty=true 2>&1 | tail -1
  echo "$VAN_TAY" > .van-tay-deploy
  echo "$(LUC) ✅ Đã deploy (dữ liệu đổi)"
elif [ "${1:-}" = "--deploy" ]; then
  echo "$(LUC) ✅ Không đổi so với lần deploy trước — bỏ qua deploy"
else
  echo "$(LUC) ✅ Dựng + test xong (không deploy)"
fi
# Repo công khai chỉ chứa mã (15/11/2026): dữ liệu + cấu hình riêng KHÔNG lên repo này → sao lưu về kho chính (backup riêng tư 20:30)
SL="$KHO_HUONG_BRAIN/production/capital-square/web-hub"
if [ -d "$SL" ]; then
  rsync -a --delete data/ "$SL/data/" && rsync -a SPEC.md wrangler.toml cau-hinh.rieng.json "$SL/" \
    && echo "$(LUC) ✅ Đã sao lưu dữ liệu về kho" || echo "$(LUC) ⚠️ Chưa sao lưu được dữ liệu về kho"
fi
