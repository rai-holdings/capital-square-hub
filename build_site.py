#!/usr/bin/env python3
# Dựng hub tài liệu sale Capital Square: bơm data/*.json vào hub.html → site/index.html
# (doctype + head + GTM-MWQC59GP theo tools/web-chuan/CHECKLIST-WEB-MOI.md).
# Có CỔNG YMYL: gặp từ cấm trong dữ liệu/HTML thì DỪNG, không ghi site.
# Chạy: python3 build_site.py            → site/ (index.html rỗng dữ liệu + _worker.js) để deploy
#       python3 build_site.py --xem-thu  → site-xem-thu/ (dữ liệu nhúng, vai ?vai=khach) chỉ xem cục bộ
import json, pathlib, re, sys

BASE = pathlib.Path(__file__).parent
DATA = BASE / 'data'


def doc(ten, mac_dinh):
    p = DATA / ten
    if not p.exists():
        print(f'  · thiếu {ten} → dùng rỗng')
        return mac_dinh
    return json.loads(p.read_text(encoding='utf-8'))


toa = doc('toa.json', [])
mb = doc('mat_bang.json', {})
cs = doc('chinh_sach.json', [])
kb = doc('kien_thuc.json', [])
da = doc('du_an.json', {})
gh = doc('units.json', {})
units = gh.get('units', []) if isinstance(gh, dict) else gh
meta = doc('meta.json', {})
if isinstance(gh, dict) and gh.get('cap_nhat'): meta['gio_hang_cap_nhat'] = gh['cap_nhat']
ts = doc('kich_ban.json', {})

# Mục KB thiếu tiêu đề → lấy cụm khóa đầu, để thẻ không trống
for k in kb:
    if not k.get('tieu_de'):
        k['tieu_de'] = (k.get('keys') or [k.get('id', '')])[0]

XEM_THU = '--xem-thu' in sys.argv  # bản xem cục bộ có dữ liệu trong HTML → site-xem-thu/, KHÔNG deploy
du_lieu = {'TOA': toa, 'MB': mb, 'CS': cs, 'KB': kb, 'UNITS': units, 'META': meta, 'TS': ts, 'DU_AN': da}
j = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')

src = (BASE / 'hub.html').read_text(encoding='utf-8')
assert '/*__XEM_THU__*/null' in src, 'hub.html thiếu chỗ bơm /*__XEM_THU__*/null'
if XEM_THU:
    src = src.replace('/*__XEM_THU__*/null', j(du_lieu), 1)
# Bản deploy: HTML KHÔNG chứa dữ liệu — dữ liệu đóng vào site/_worker.js, chỉ trả sau đăng nhập
tpl = (BASE / 'worker' / 'worker.tpl.js').read_text(encoding='utf-8')
assert '/*__DU_LIEU__*/null' in tpl
worker_js = tpl.replace('/*__DU_LIEU__*/null', j(du_lieu), 1)

# ---- CỔNG YMYL (mục 10.2 CLAUDE.md) ----
CAM = [
    (r'sổ đỏ', 'dùng "Giấy chứng nhận (sổ hồng)"'),
    (r'rai\s*holdings', 'không lộ tên Rai Holdings trên hub dự án'),
    (r'cam kết (lợi nhuận|sinh lời|lãi)', 'cấm cam kết lợi nhuận'),
    (r'lợi nhuận (tối thiểu|chắc chắn|đảm bảo)', 'cấm cam kết lợi nhuận'),
    (r'chắc chắn tăng giá', 'cấm hứa tăng giá'),
    (r'(tốt|rẻ) nhất thị trường|số 1 (đà nẵng|việt nam)', 'cấm từ tối cao không bằng chứng'),
]
thap = (src + '\n' + j(du_lieu)).lower()
loi = []
for mau, ly_do in CAM:
    for m in re.finditer(mau, thap):
        dong = thap[max(0, m.start() - 60):m.end() + 60].replace('\n', ' ')
        # cho phép câu PHỦ ĐỊNH / cảnh báo (vd "không nói sổ đỏ", "không cam kết lợi nhuận")
        if re.search(r'(không|cấm|đừng|chưa|tránh|chứ không)[^.<]{0,40}$', thap[max(0, m.start() - 45):m.start()]):
            continue
        loi.append(f'{ly_do}: …{dong}…')
if loi:
    print('❌ CỔNG YMYL CHẶN — sửa dữ liệu rồi dựng lại:')
    for l in loi:
        print('  -', l)
    sys.exit(1)

m = re.search(r'<title>(.*?)</title>\s*', src, re.S)
title = m.group(1) if m else 'Capital Square Đà Nẵng — Hub tài liệu sale'
body = src.replace(m.group(0), '', 1) if m else src

GTM_HEAD = """<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-MWQC59GP');</script>
<!-- End Google Tag Manager -->"""
GTM_BODY = """<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MWQC59GP"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->"""

html = f"""<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{title}</title>
<meta name="description" content="Hub tài liệu nội bộ cho đội sale dự án Capital Square Đà Nẵng: tòa, mặt bằng, chính sách bán hàng, lịch thanh toán, pháp lý, hỏi đáp.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
{GTM_HEAD}
</head>
<body>
{GTM_BODY}
{body}
</body>
</html>
"""

out = BASE / ('site-xem-thu' if XEM_THU else 'site')
out.mkdir(exist_ok=True)
# Ảnh bảng hàng (phiếu tính giá / chỉ căn / thẻ FBG) → site/anh/. Worker CHẶN /anh/ trực tiếp, chỉ trả qua /api/anh có phiên.
import shutil
if (BASE / 'anh-nguon').is_dir():
    shutil.rmtree(out / 'anh', ignore_errors=True)
    shutil.copytree(BASE / 'anh-nguon', out / 'anh')
(out / 'index.html').write_text(html, encoding='utf-8')
if not XEM_THU:
    (out / '_worker.js').write_text(worker_js, encoding='utf-8')
    assert '"KB"' not in html and 'so-huu-nguoi-nuoc-ngoai' not in html, 'RÒ DỮ LIỆU: index.html deploy không được chứa dữ liệu'
print(f'OK -> {out / "index.html"} {len(html):,} bytes · {len(toa)} tòa · '
      f'{sum(len(l.get("can", [])) for t in mb.values() for l in t.get("mat_bang_loai", []))} căn mặt bằng · '
      f'{len(cs)} CSBH · {len(kb)} hỏi đáp · {len(units)} căn bảng hàng')

# ---- CỔNG CÚ PHÁP: JS lỗi = form đăng nhập chết im (trang vẫn khoá nhưng không ai vào được) ----
import subprocess, tempfile
for ten, ma in [('index.html <script>', re.findall(r'<script>(.*?)</script>', html, re.S)[-1])] + ([] if XEM_THU else [('_worker.js', worker_js)]):
    with tempfile.NamedTemporaryFile('w', suffix='.mjs', delete=False, encoding='utf-8') as f:
        f.write(ma)
    r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True)
    if r.returncode:
        print(f'❌ CỔNG CÚ PHÁP CHẶN — {ten}:\n{r.stderr[:600]}')
        sys.exit(1)
print('✓ cú pháp JS sạch')
