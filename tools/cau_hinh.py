# Đọc cấu hình riêng của máy (cau-hinh.rieng.json, không lên git). Mẫu: cau-hinh.mau.json
import json, pathlib, sys
_P = pathlib.Path(__file__).resolve().parents[1] / 'cau-hinh.rieng.json'
if not _P.exists():
    sys.exit('Thiếu cau-hinh.rieng.json — chép cau-hinh.mau.json rồi điền mã của mình')
CAU_HINH = json.loads(_P.read_text(encoding='utf-8'))
