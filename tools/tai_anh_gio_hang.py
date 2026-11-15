#!/usr/bin/env python3
# Tải ảnh phiếu tính giá (TTS/TTTĐ/TTV) + chỉ căn (PNG tên = mã căn) của TỪNG căn từ thư mục Drive
# ghi ở cột "Link PTG" của sheet "GIỎ HÀNG DỰ ÁN CAPITAL SQUARE" (file giỏ hàng tổng hợp FBG).
# Nguồn gốc → raw/assets/capital-square/gio-hang/<MÃ CĂN>/ (bất biến). Token drive.readonly có sẵn của MCP Drive.
# Chạy: python3 tools/tai_anh_gio_hang.py <file xlsx giỏ hàng>
import json, urllib.request, urllib.parse, pathlib, sys, re, warnings
import os
import openpyxl
warnings.filterwarnings('ignore')
CFG = pathlib.Path.home() / '.config/google-drive-mcp'
keys = json.load(open(CFG / 'gcp-oauth.keys.json'))['installed']
tok = json.load(open(CFG / 'tokens.json'))
resp = json.load(urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=urllib.parse.urlencode({
    'client_id': keys['client_id'], 'client_secret': keys['client_secret'], 'refresh_token': tok['refresh_token'], 'grant_type': 'refresh_token'}).encode())))
H = {'Authorization': 'Bearer ' + resp['access_token']}
OUT = pathlib.Path(os.environ.get('KHO_HUONG_BRAIN') or pathlib.Path.home() / 'Hường Brain') / 'raw/assets/capital-square/gio-hang'

ws = openpyxl.load_workbook(sys.argv[1], data_only=True)['GIỎ HÀNG DỰ ÁN CAPITAL SQUARE']
for row in ws.iter_rows(min_row=4):
    ma = str(row[1].value or '').strip()
    link = next((c.hyperlink.target for c in row if c.hyperlink), None)
    m = re.search(r'/folders/([\w-]+)', link or '')
    if not ma or not m: continue
    q = urllib.parse.quote(f"'{m.group(1)}' in parents and trashed=false")
    files = json.load(urllib.request.urlopen(urllib.request.Request(f'https://www.googleapis.com/drive/v3/files?q={q}&fields=files(id,name,mimeType,modifiedTime)', headers=H)))['files']
    d = OUT / ma; d.mkdir(parents=True, exist_ok=True)
    (d / '_drive.json').write_text(json.dumps({'folder': m.group(1), 'files': files}, ensure_ascii=False, indent=1))
    for f in files:
        dest = d / f['name']
        if dest.exists() and dest.stat().st_size > 1000: continue
        with urllib.request.urlopen(urllib.request.Request(f"https://www.googleapis.com/drive/v3/files/{f['id']}?alt=media", headers=H)) as r:
            dest.write_bytes(r.read())
    print(ma, len(files), 'file')
