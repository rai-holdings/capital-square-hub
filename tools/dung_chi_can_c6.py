#!/usr/bin/env python3
# Dựng ảnh CHỈ CĂN cho căn tòa C6 (Kings) chưa có chỉ căn chính thức: tô đỏ đúng ô căn trên
# "MBDH TÒA KINGS" (mặt bằng điển hình tầng 11-12, 14-27 — nửa TRÊN ảnh). Ảnh ghi rõ "dựng từ mặt bằng điển hình".
# Toạ độ ô đo trên ảnh gốc 3508×3508 (đọc tay từ bản vẽ, kiểm bằng mắt sau khi dựng).
import pathlib, sys
import os
from PIL import Image, ImageDraw, ImageFont
GOC = pathlib.Path(os.environ.get('KHO_HUONG_BRAIN') or pathlib.Path.home() / 'Hường Brain') / 'raw/assets/capital-square/chi-can-truc/C6-mat-bang/MBDH TÒA KINGS.jpg'
OUT = pathlib.Path(__file__).resolve().parents[1] / 'anh-nguon/chi-can'
K = 3508 / 1300   # hệ số từ bản xem 1300px → ảnh gốc
O_CAN = {  # trục → (x0, y0, x1, y1) trên bản 1300px, nửa trên (tầng 11-12, 14-27)
    '02': (817, 352, 944, 521),
    '09': (461, 146, 569, 315),
}
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def dung(ma, truc, dt, loai, tang):
    im = Image.open(GOC).convert('RGB').crop((0, 0, 3508, int(655 * K)))
    lop = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lop)
    x0, y0, x1, y1 = [int(v * K) for v in O_CAN[truc]]
    d.rectangle((x0, y0, x1, y1), fill=(220, 30, 30, 110), outline=(200, 0, 0, 255), width=14)
    im = Image.alpha_composite(im.convert('RGBA'), lop).convert('RGB')
    W = im.width; dau = Image.new('RGB', (W, 330), (22, 50, 79)); dd = ImageDraw.Draw(dau)
    dd.text((70, 50), f'CHỈ CĂN {ma}', font=ImageFont.truetype(FONT, 110), fill=(244, 234, 214))
    dd.text((70, 200), f'Tòa C6 Kings Place · Tầng {tang} · {loai} · Thông thủy {dt} m²', font=ImageFont.truetype(FONT, 64), fill=(255, 255, 255))
    chan = Image.new('RGB', (W, 150), (250, 248, 243)); dc = ImageDraw.Draw(chan)
    dc.text((70, 45), 'Dựng từ mặt bằng điển hình tầng 11-12, 14-27 (kit đại lý). Vị trí tham khảo — căn cứ cuối cùng là HĐMB.', font=ImageFont.truetype(FONT, 52), fill=(93, 101, 118))
    tong = Image.new('RGB', (W, 330 + im.height + 150), 'white')
    tong.paste(dau, (0, 0)); tong.paste(im, (0, 330)); tong.paste(chan, (0, 330 + im.height))
    tong.thumbnail((1800, 1800)); OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f'{ma}.jpg'; tong.save(p, quality=82); print('->', p)
if __name__ == '__main__':
    dung('C6-1902', '02', '64,76', '2PN', 19)
    dung('C6-1809', '09', '45,28', '1PN', 18)
