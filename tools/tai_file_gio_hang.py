#!/usr/bin/env python3
# Tải BẢN MỚI NHẤT file giỏ hàng tổng hợp FBG từ Drive → raw/du-an-capital-square/gio-hang-fbg-tong-hop-<ngày sửa>.xlsx
# In ra 2 dòng: đường dẫn file · ngày sửa (YYYY-MM-DD, giờ VN). Đã có bản cùng ngày sửa thì không tải lại.
import json, urllib.request, urllib.parse, pathlib, datetime
import os
from cau_hinh import CAU_HINH
FILE_ID = CAU_HINH['drive_file_gio_hang']
CFG = pathlib.Path.home() / '.config/google-drive-mcp'
keys = json.load(open(CFG / 'gcp-oauth.keys.json'))['installed']; tok = json.load(open(CFG / 'tokens.json'))
H = {'Authorization': 'Bearer ' + json.load(urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=urllib.parse.urlencode({
    'client_id': keys['client_id'], 'client_secret': keys['client_secret'], 'refresh_token': tok['refresh_token'], 'grant_type': 'refresh_token'}).encode())))['access_token']}
meta = json.load(urllib.request.urlopen(urllib.request.Request(f'https://www.googleapis.com/drive/v3/files/{FILE_ID}?fields=modifiedTime,name', headers=H)))
ngay = (datetime.datetime.fromisoformat(meta['modifiedTime'].replace('Z', '+00:00')) + datetime.timedelta(hours=7)).date().isoformat()
dst = pathlib.Path(os.environ.get('KHO_HUONG_BRAIN') or pathlib.Path.home() / 'Hường Brain') / f'raw/du-an-capital-square/gio-hang-fbg-tong-hop-{ngay}.xlsx'
if not dst.exists():
    with urllib.request.urlopen(urllib.request.Request(f'https://www.googleapis.com/drive/v3/files/{FILE_ID}?alt=media', headers=H)) as r: dst.write_bytes(r.read())
print(dst); print(ngay)
