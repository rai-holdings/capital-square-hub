#!/usr/bin/env python3
# Đọc GIỎ HÀNG Capital Square (sheet "GIỎ HÀNG DỰ ÁN CAPITAL SQUARE" trong file tổng hợp FBG) → data/units.json
# + chuẩn bị ảnh cho hub trong anh-nguon/ (build_site.py chép sang site/anh/, Worker chặn truy cập trực tiếp):
#   ptg/<MÃ>-<pa>.jpg     phiếu tính giá CĐT (pa: tien-do | vay | tts) — phân loại theo CHỮ trên phiếu (OCR Vision,
#                         file .ocr.txt cạnh ảnh gốc) + đối chiếu số tổng với cột giá giỏ hàng. VĂN BẢN NỘI BỘ → chỉ sale.
#   chi-can/<MÃ>.jpg      chỉ căn: C1 = ảnh chính thức theo TRỤC (dải tầng 5-9 / 10-12,14-25); C6 = dung_chi_can_c6.py
#   the-fbg/<MÃ>.jpg      thẻ căn FBG Land (có giá cả 3 phương án) → chỉ sale
# Luật: KHÔNG sửa số trong nguồn. Ô sai định dạng → giữ nguyên chuỗi gốc + cờ canh_bao. Cột "Giá Naked (giá tính
# hoa hồng)" là số NỘI BỘ → trường gia_hh, máy chủ chỉ gửi cho admin.
# Chạy: python3 tools/doc_gio_hang.py <xlsx giỏ hàng> [ngày cập nhật YYYY-MM-DD]
import sys, re, json, pathlib, warnings
from cau_hinh import CAU_HINH
import os
import openpyxl
from PIL import Image
warnings.filterwarnings('ignore')
HUB = pathlib.Path(__file__).resolve().parents[1]
KHO = pathlib.Path(os.environ.get('KHO_HUONG_BRAIN') or pathlib.Path.home() / 'Hường Brain')
GH = KHO / 'raw/assets/capital-square/gio-hang'
TRUC = KHO / 'raw/assets/capital-square/chi-can-truc'
ANH = HUB / 'anh-nguon'

def so(v, ten, ma, canh):
    """Số tiền từ ô Excel. Chuỗi có dấu phẩy nhóm 3 chữ số hợp lệ → int. Sai nhóm → None + cảnh báo (không đoán)."""
    if v is None or v == '': return None
    if isinstance(v, (int, float)): return int(round(v))
    s = str(v).strip()
    if re.fullmatch(r'\d{1,3}(,\d{3})+', s): return int(s.replace(',', ''))
    if re.fullmatch(r'\d+', s): return int(s)
    canh.append(f'Ô "{ten}" ghi "{s}" (sai định dạng số) — hub KHÔNG tự sửa, hỏi quản lý số đúng.')
    return None

def dt(v):
    if isinstance(v, (int, float)): return round(float(v), 2)
    return round(float(str(v).replace(',', '.')), 2) if v not in (None, '') else None

def nen(src, dst, rong=1400, q=74):
    dst.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGB'); im.thumbnail((rong, rong * 3)); im.save(dst, quality=q, optimize=True)

def pa_cua_phieu(txt):
    t = txt.lower()
    if 'hỗ trợ lãi suất' in t or 'hồ trợ lãi suất' in t: return 'vay'
    if 'nhanh 95' in t: return 'tts'
    if 'theo tiến độ' in t or 'theo tiền độ' in t: return 'tien-do'
    return None

def main(xlsx, ngay):
    ws = openpyxl.load_workbook(xlsx, data_only=True)['GIỎ HÀNG DỰ ÁN CAPITAL SQUARE']
    units = []
    for row in ws.iter_rows(min_row=4):
        v = [c.value for c in row]
        ma = str(v[1] or '').strip()
        if not re.fullmatch(r'[CS]\d-\d{3,4}A?', ma): continue
        canh = []
        toa, tang = ma.split('-')[0], int(ma.split('-')[1][:2])
        truc = ma.split('-')[1][2:]
        u = {'ma': ma, 'toa': toa, 'tang': tang, 'truc': truc, 'dt': dt(v[4]),
             'loai': re.sub(r'\s+', '', str(v[5] or '')).upper().replace('PN', 'PN') or None,
             'gia_hh': so(v[6], 'Tổng giá Naked', ma, canh),
             'gia_tong': so(v[7], 'Tổng giá CH (gồm VAT và KPBT)', ma, canh),
             'gia_tien_do': so(v[8], 'TT tiến độ (CK 3%)', ma, canh),
             'gia_vay': so(v[9], 'TT vay', ma, canh),
             'gia_tts': so(v[10], 'TTS (CK 12%)', ma, canh),
             'tinh_trang': str(v[11] or '').strip().title() or None,
             'ptg': {}, 'chi_can': None, 'the_fbg': None, 'canh_bao': canh,
             'nguon': f'giỏ hàng FBG (sheet Capital Square, dòng {row[0].row})'}
        if u['gia_tong'] is None and v[7] not in (None, ''): u['gia_tong_goc'] = str(v[7])
        # Phiếu tính giá + thẻ FBG từ thư mục "Link PTG" (đã tải bằng tai_anh_gio_hang.py)
        d = GH / ma
        if d.is_dir():
            for f in sorted(d.iterdir()):
                if f.suffix.lower() not in ('.jpg', '.jpeg', '.png'): continue
                ocr = f.with_name(f.stem + '.ocr.txt')
                txt = ocr.read_text() if ocr.exists() else ''
                if 'MÃ CĂN' in txt.upper():
                    nen(f, ANH / 'the-fbg' / f'{ma}.jpg'); u['the_fbg'] = f'the-fbg/{ma}.jpg'; continue
                pa = pa_cua_phieu(txt)
                if not pa: canh.append(f'Ảnh {f.name}: không nhận ra phương án.'); continue
                # đối chiếu số tổng trên phiếu với cột giá giỏ hàng
                gia = {'tien-do': u['gia_tien_do'], 'vay': u['gia_vay'], 'tts': u['gia_tts']}[pa]
                so_phieu = [int(x.replace('.', '').replace(',', '')) for x in re.findall(r'\b\d{1,3}(?:[.,]\d{3}){2,}\b', txt)]
                if gia and gia not in so_phieu: canh.append(f'Phiếu {pa}: số tổng trên phiếu không khớp giỏ hàng ({gia:,}).')
                k = {'tien-do': 'gia_tien_do', 'vay': 'gia_vay', 'tts': 'gia_tts'}[pa]
                if gia is None and so_phieu:
                    # ô giỏ hàng TRỐNG → lấy "5. Tổng giá bán (gồm VAT và KPBT)" = số lớn nhất trên phiếu CĐT, ghi nguồn
                    u[k] = max(so_phieu); u.setdefault('gia_tu_phieu', []).append(pa)
                    canh.append(f'Giá phương án {pa}: ô giỏ hàng trống → lấy từ phiếu tính giá CĐT ({u[k]:,}).')
                nen(f, ANH / 'ptg' / f'{ma}-{pa}.jpg'); u['ptg'][pa] = f'ptg/{ma}-{pa}.jpg'
        else:
            canh.append('Chưa có thư mục phiếu tính giá (ô "Link PTG" trống).')
        # Chỉ căn
        if toa == 'C1':
            dai = 'C1-T05-09' if 5 <= tang <= 9 else 'C1-T10-12-14-25'
            ten = truc if truc.endswith('A') else str(int(truc))
            cands = [TRUC / dai / f'{ten}.jpg', TRUC / dai / f'{ten.lstrip("0")}.jpg', TRUC / dai / f'0{ten}.jpg']
            src = next((c for c in cands if c.exists()), None)
            if src: nen(src, ANH / 'chi-can' / f'{ma}.jpg', 1600, 72); u['chi_can'] = f'chi-can/{ma}.jpg'; u['chi_can_nguon'] = f'chính thức theo trục ({dai})'
        elif (ANH / 'chi-can' / f'{ma}.jpg').exists():
            u['chi_can'] = f'chi-can/{ma}.jpg'; u['chi_can_nguon'] = 'dựng từ mặt bằng điển hình (kit đại lý)'
        if not u['chi_can']: canh.append('Chưa có ảnh chỉ căn.')
        units.append(u)
    out = {'cap_nhat': ngay, 'nguon': 'FBG PROPERTY - GIỎ HÀNG TỔNG HỢP TẤT CẢ DỰ ÁN.xlsx (Drive ' + CAU_HINH['drive_file_gio_hang'] + '), sheet "GIỎ HÀNG DỰ ÁN CAPITAL SQUARE"', 'units': units}
    (HUB / 'data/units.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f'{len(units)} căn · cảnh báo:', sum(len(u['canh_bao']) for u in units))
    for u in units:
        print(f"  {u['ma']:9} {u['loai'] or '?':5} {u['dt']} m² · tổng {u['gia_tong']} · PTG {sorted(u['ptg'])} · chỉ căn {'có' if u['chi_can'] else 'KHÔNG'}", *(['⚠️ ' + c for c in u['canh_bao']]))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
