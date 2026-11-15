#!/usr/bin/env python3
# Đọc TẤT CẢ sheet của file giỏ hàng tổng hợp FBG → data/du_an.json cho màn hình "Chọn dự án".
# Mỗi sheet = 1 dự án. Bộ đọc CHUNG vì mỗi sheet một kiểu: tự dò dòng tiêu đề (có thể 2 tầng), tách bảng đặt
# cạnh nhau (giỏ chéo), bỏ dòng phân đoạn ("TẦNG 10", "TOÀ A1"), lấy ngày cập nhật ghi trong sheet.
# Cột NỘI BỘ (Naked / hoa hồng / giá vốn / map giỏ) → gắn noi_bo=True: máy chủ chỉ gửi cho admin.
# Cột link (PTG, chỉ căn) → lấy hyperlink, chỉ sale/admin. Không sửa số: giữ chuỗi hiển thị như trong sheet.
# Chạy: python3 tools/doc_gio_hang_tat_ca.py <xlsx> [YYYY-MM-DD ngày sửa file]
import sys, re, json, pathlib, unicodedata, warnings
from cau_hinh import CAU_HINH
import openpyxl
warnings.filterwarnings('ignore')
HUB = pathlib.Path(__file__).resolve().parents[1]

def bo_dau(s):
    s = unicodedata.normalize('NFD', str(s or '')).replace('đ', 'd').replace('Đ', 'D')
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()

def gon(s): return re.sub(r'\s+', ' ', str(s or '')).strip()

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', bo_dau(s)).strip('-')

TEN_CHUAN = {'GIỎ HÀNG ĐỘC QUYỀN S-LIGHT TOWE': 'S-Light Tower', 'Giỏ hàng chéo của SUN': 'Giỏ chéo Sun Group', 'GIỎ HÀNG MERIDIAN - TP': 'Meridian', 'ĐỘC QUYỀN - SUN SYMPHONY 5': 'Sun Symphony 5', 'GIỎ HÀNG TIME SQUARE': 'Time Square', 'GIỎ HÀNG FUTA KIM PHÁT': 'FUTA Kim Phát', 'GIỎ HÀNG FUTA KIM AN': 'FUTA Kim An'}

def ten_du_an(sheet):
    if sheet in TEN_CHUAN: return TEN_CHUAN[sheet]
    t = re.sub(r'^(gio hang( doc quyen| du an)?|doc quyen -?)\s*', '', bo_dau(sheet)).strip(' -')
    goc = sheet
    for tien_to in ['GIỎ HÀNG ĐỘC QUYỀN', 'GIỎ HÀNG DỰ ÁN', 'GIỎ HÀNG', 'ĐỘC QUYỀN -', 'Giỏ hàng']:
        if goc.upper().startswith(tien_to.upper()): goc = goc[len(tien_to):].strip(' -'); break
    return goc.strip().title() or sheet

NOI_BO = re.compile(r'naked|hoa hong|gia von|\bhh\b|map gio')
LA_LINK = re.compile(r'link|ptg|chi can')
TU_TIEU_DE = re.compile(r'\b(ma|can|tang|toa|thap|dien tich|dt|loai|gia|stt|block)\b')

def hien(v):
    if v is None: return ''
    if isinstance(v, float):
        if v.is_integer(): return f'{int(v):,}' if abs(v) >= 10000 else str(int(v))
        return f'{v:.2f}'.rstrip('0').rstrip('.').replace('.', ',')
    if isinstance(v, int): return f'{v:,}' if abs(v) >= 10000 else str(v)
    return gon(v)

def doc_sheet(ws):
    luoi = [[c for c in row] for row in ws.iter_rows()]
    val = [[c.value for c in r] for r in luoi]
    ngay = None
    for r in val[:6]:
        for v in r:
            m = re.search(r'(?:cập nhật|phát hành)[^0-9]*(\d{1,2}/\d{1,2}/\d{4})', str(v or ''), re.I)
            if m: ngay = m.group(1)
    # dòng tiêu đề: trong 8 dòng đầu, dòng có >=4 ô chữ và >=2 ô khớp từ tiêu đề
    hdr = None
    for i, r in enumerate(val[:8]):
        cells = [bo_dau(x) for x in r if x not in (None, '')]
        if len(cells) >= 4 and sum(bool(TU_TIEU_DE.search(c)) for c in cells) >= 2: hdr = i; break
    if hdr is None: return None
    H = [gon(x) for x in val[hdr]]
    # tiêu đề 2 tầng: dòng dưới có chữ ở cột tiêu đề trống/None (vd "Tầng 1..4" dưới "Diện tích sàn/căn")
    duoi = val[hdr + 1] if hdr + 1 < len(val) else []
    # chỉ là tầng 2 khi có >=2 ô chữ nằm dưới cột KHÔNG có tiêu đề (vd FUTA "Tầng 1..4"); dòng phân đoạn "TOÀ A1" nằm dưới cột có tiêu đề → không
    hai_tang = duoi and not any(isinstance(x, (int, float)) for x in duoi) and sum(1 for j, x in enumerate(duoi) if isinstance(x, str) and x.strip() and (j >= len(H) or not H[j] or H[j] == 'None')) >= 2
    if hai_tang:
        cha = ''
        for j in range(len(H)):
            if H[j] and H[j] != 'None': cha = H[j]
            con = gon(duoi[j]) if j < len(duoi) else ''
            if con: H[j] = f'{cha} – {con}' if cha and cha != con else con
    bat_dau = hdr + (2 if hai_tang else 1)
    # tách nhiều bảng đặt cạnh nhau: cột "STT"/"#" lặp lại
    moc = [j for j, h in enumerate(H) if bo_dau(h) in ('stt', '#')] or [0]
    bang = []
    for k, c0 in enumerate(moc):
        c1 = moc[k + 1] if k + 1 < len(moc) else len(H)
        cols = [j for j in range(c0, c1) if H[j] and H[j] != 'None']
        if not cols: continue
        cot_ma = next((j for j in cols if re.search(r'\bma\b', bo_dau(H[j]))), None)
        dong = []
        for r_i in range(bat_dau, len(val)):
            r = val[r_i]
            o = [r[j] if j < len(r) else None for j in cols]
            day = [x for x in o if x not in (None, '')]
            if len(day) < 3: continue                          # dòng trống / phân đoạn ("TẦNG 10", "TOÀ A1")
            if cot_ma is not None and (r[cot_ma] if cot_ma < len(r) else None) in (None, ''): continue
            d = {}
            for j in cols:
                c = luoi[r_i][j] if j < len(luoi[r_i]) else None
                if LA_LINK.search(bo_dau(H[j])):
                    d[H[j]] = c.hyperlink.target if c is not None and c.hyperlink else ''
                else:
                    d[H[j]] = hien(c.value if c is not None else None)
            dong.append(d)
        tieu = next((gon(val[i][j]) for i in range(hdr) for j in range(c0, c1) if j < len(val[i]) and isinstance(val[i][j], str) and val[i][j].strip()), '') if len(moc) > 1 else ''
        if dong: bang.append({'tieu_de': tieu, 'cot': [H[j] for j in cols], 'dong': dong})
    return {'ngay_trong_sheet': ngay, 'bang': bang}

def main(xlsx, ngay_file):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    ds = []
    for ws in wb.worksheets:
        kq = doc_sheet(ws) or {'ngay_trong_sheet': None, 'bang': []}
        ten = 'Capital Square' if 'CAPITAL' in ws.title.upper() else ten_du_an(ws.title)
        cot_all = sorted({c for b in kq['bang'] for c in b['cot']})
        ds.append({
            'slug': 'capital-square' if ten == 'Capital Square' else slug(ten),
            'ten': ten, 'sheet': ws.title, 'co_hub': ten == 'Capital Square',
            'so_can': sum(len(b['dong']) for b in kq['bang']),
            'ngay': kq['ngay_trong_sheet'], 'bang': kq['bang'],
            'cot_noi_bo': [c for c in cot_all if NOI_BO.search(bo_dau(c))],
            'cot_link': [c for c in cot_all if LA_LINK.search(bo_dau(c))],
        })
    out = {'cap_nhat': ngay_file, 'nguon': 'FBG PROPERTY - GIỎ HÀNG TỔNG HỢP TẤT CẢ DỰ ÁN.xlsx (Drive ' + CAU_HINH['drive_file_gio_hang'] + ')', 'du_an': ds}
    (HUB / 'data/du_an.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    for d in ds:
        print(f"{d['ten'][:32]:32} {d['so_can']:4} căn · {len(d['bang'])} bảng · ngày {d['ngay']} · nội bộ {d['cot_noi_bo']} · link {d['cot_link']}")

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
