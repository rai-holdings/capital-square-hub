#!/usr/bin/env python3
# Tải ẢNH CHỈ CĂN THEO TRỤC (chính thức, kit Drive đại lý "6 - Mặt bằng/C1/CHỈ CĂN TRỤC") + mặt bằng Kings (C6)
# → raw/assets/capital-square/chi-can-truc/<dải tầng>/<trục>.jpg. Token drive.readonly của MCP Drive.
import json, urllib.request, urllib.parse, pathlib
import os
CFG = pathlib.Path.home() / '.config/google-drive-mcp'
keys = json.load(open(CFG / 'gcp-oauth.keys.json'))['installed']; tok = json.load(open(CFG / 'tokens.json'))
H = {'Authorization': 'Bearer ' + json.load(urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token', data=urllib.parse.urlencode({
    'client_id': keys['client_id'], 'client_secret': keys['client_secret'], 'refresh_token': tok['refresh_token'], 'grant_type': 'refresh_token'}).encode())))['access_token']}
OUT = pathlib.Path(os.environ.get('KHO_HUONG_BRAIN') or pathlib.Path.home() / 'Hường Brain') / 'raw/assets/capital-square/chi-can-truc'
from cau_hinh import CAU_HINH
NGUON = CAU_HINH['drive_thu_muc_chi_can']
for ten, fid in NGUON.items():
    q = urllib.parse.quote(f"'{fid}' in parents and trashed=false")
    files = json.load(urllib.request.urlopen(urllib.request.Request(f'https://www.googleapis.com/drive/v3/files?q={q}&fields=files(id,name,mimeType,modifiedTime)', headers=H)))['files']
    d = OUT / ten; d.mkdir(parents=True, exist_ok=True)
    (d / '_drive.json').write_text(json.dumps({'folder': fid, 'files': files}, ensure_ascii=False, indent=1))
    for f in files:
        dest = d / (f['name'] if '.' in f['name'] else f['name'] + '.jpg')
        if not dest.exists():
            with urllib.request.urlopen(urllib.request.Request(f"https://www.googleapis.com/drive/v3/files/{f['id']}?alt=media", headers=H)) as r: dest.write_bytes(r.read())
    print(ten, len(files))
