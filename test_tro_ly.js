// Test hồi quy TRỢ LÝ hub Capital Square — 63 câu sale/khách hay hỏi (có dấu, không dấu, viết tắt, sai chính tả).
// Trích NGUYÊN VĂN khối trợ lý từ hub.html (không chép tay). Chạy trước mỗi deploy: node test_tro_ly.js — phải 63/63.
// Đo 26/09/2026: bản đầu 50/63 → sau sửa YMYL-bắt-nhầm + viết tắt + ưu tiên mã tòa + keys: 63/63.
// Trích NGUYÊN VĂN khối trợ lý từ hub.html hiện tại (không chép tay) để đo
const fs = require('fs'), D = __dirname + '/';
const h = fs.readFileSync(D + 'hub.html', 'utf8');
const khoi = h.slice(h.indexOf('// Chặn câu hỏi lợi nhuận/cam kết'), h.indexOf('function botMsg'));
const bo_dau = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
const arr = x => Array.isArray(x) ? x : (x == null || x === '' ? [] : [x]);
const esc = s => String(s ?? '');
const KB = JSON.parse(fs.readFileSync(D + 'data/kien_thuc.json')), TOA = JSON.parse(fs.readFileSync(D + 'data/toa.json')), CS = JSON.parse(fs.readFileSync(D + 'data/chinh_sach.json'));
const t = new Function('bo_dau','arr','esc','KB','TOA','CS', khoi + '\nreturn { traLoi, timKB };')(bo_dau, arr, esc, KB, TOA, CS);


const C=[
['cđt là ai vậy em','hai-phan-khu-hai-cdt'],
['chu dau tu du an nay la cong ty nao','hai-phan-khu-hai-cdt'],
['s4 bn căn','hudson-place-s4'],
['Hudson có bao nhiêu căn, mấy tầng','hudson-place-s4'],
['hđmb ký với ai','s4-chuyen-nhuong-hdmb'],
['sao s4 lại ký chuyển nhượng hđ mà ko ký cđt','s4-chuyen-nhuong-hdmb'],
['cọc bn','coc-va-ttdccn'],
['tiền cọc có hoàn lại không','coc-va-ttdccn'],
['ng nước ngoài mua dc ko','so-huu-nguoi-nuoc-ngoai'],
['khách Hàn Quốc muốn mua','so-huu-nguoi-nuoc-ngoai'],
['việt kiều có mua được không','so-huu-nguoi-nuoc-ngoai'],
['sổ hồng lâu dài hay 50 năm','thoi-han-so-huu'],
['bao giờ có sổ','thoi-han-so-huu'],
['bàn giao khi nào','thoi-diem-ban-giao'],
['khi nao nhan nha','thoi-diem-ban-giao'],
['bàn giao thô hay hoàn thiện','tieu-chuan-ban-giao'],
['có tủ bếp điều hòa ko','tieu-chuan-ban-giao'],
['giá bao nhiêu 1m2','gia-tham-khao'],
['căn 2pn giá bn','gia-tham-khao'],
['chiết khấu bao nhiêu','csbh-s4-tong-quan'],
['csbh s4','csbh-s4-tong-quan'],
['thanh toán sớm được ck bao nhiêu %','thanh-toan-som-s4'],
['vay ngân hàng được bao nhiêu %','vay-ngan-hang'],
['hỗ trợ lãi suất mấy tháng','vay-ngan-hang'],
['phí quản lý bao nhiêu 1 tháng','quan-ly-van-hanh-phi'],
['phí dv hàng tháng','quan-ly-van-hanh-phi'],
['dự án đang thế chấp ngân hàng à','the-chap-giai-chap'],
['pháp lý s4 ok chưa','phap-ly-toa-s4'],
['dự án có đủ đk mở bán chưa','phap-ly-du-dieu-kien-ban'],
['cách biển bao xa','khoang-cach-ket-noi'],
['địa chỉ nhà mẫu','vi-tri-dia-chi'],
['có chỗ đậu ô tô không','ham-do-xe'],
['dự án có bể bơi không','tien-ich-88'],
['2pn rộng bao nhiêu m2','co-cau-can-dien-tich'],
['căn nhỏ nhất bao nhiêu mét','co-cau-can-dien-tich'],
['early bird còn ko','early-birds'],
['quà smarthome gồm gì','qua-smarthome'],
['cần giấy tờ gì khi ký','ho-so-khach-can'],
['đổi tên người mua được không','chuyen-ten-chuyen-can-gia-han'],
['tiến độ thanh toán s4','tien-do-thanh-toan-thuong-s4'],
['vay thì cần bao nhiêu tiền mặt','tien-do-vay-s4'],
['xây tới tầng mấy rồi','tien-do-thi-cong'],
['nghe nói có vụ sụt lún','su-co-sut-lun-12-2025'],
['có phải dự án của BRG không','brg-lien-quan'],
['dự án này bị treo lâu rồi mà','lich-su-du-an'],
['bên em là đại lý hay cđt','don-vi-phan-phoi'],
['mua để cho thuê có lời không','YMYL'],
['bao lâu thì hoàn vốn','YMYL|chan-ymyl-loi-nhuan'],
['vay lãi mấy %','vay-ngan-hang'],
['cđt có cam kết bàn giao đúng hạn ko','thoi-diem-ban-giao'],
['ban giao khj nao','thoi-diem-ban-giao'],
['nguoi nc ngoai mua dc k','so-huu-nguoi-nuoc-ngoai'],
['phap ly toa s4','phap-ly-toa-s4'],
['khách hỏi giá thuê căn 1pn','YMYL|chan-ymyl-loi-nhuan'],
['đã có giấy phép xây dựng rồi chứ','phap-ly-du-dieu-kien-ban'],
['dien tich can 3pn','co-cau-can-dien-tich'],
['giá cao quá em ơi','tu-choi-gia-cao'],
['nhà chưa xây xong sợ lắm','tu-choi-chua-ban-giao'],
['bảo lãnh ngân hàng có không','bao-lanh-ngan-hang'],
['toa c4 thanh toan the nao','tien-do-thanh-toan-khoi-c'],
['Times Place chính sách gì','TOA:C1|tien-do-thanh-toan-khoi-c'],
['bảo hành mấy năm','bao-hanh-nghiem-thu'],
['ky hop dong o dau','quy-trinh-book-ky'],
];
let ok=0,miss=0,wrong=0;const bad=[];
for(const [q,e] of C){
  const r=t.traLoi(q);
  const got=r.k?r.k.id:(/không trả lời bằng con số/.test(r.a)?'YMYL':(/Xem hồ sơ tòa/.test(r.a)?'TOA:'+(r.a.match(/<b>(\w+)/)||[])[1]:'MISS'));
  const acc=e.split('|');
  if(acc.includes(got)) ok++; else { if(got==='MISS') miss++; else wrong++; const top=t.timKB(q,3).map(h=>h.k.id+':'+h.d.toFixed(1)).join(', '); bad.push(`${got==='MISS'?'TRƯỢT':'NHẦM'} | ${q} | cần ${e} | ra ${got} | top: ${top}`);}
}
console.log(`Tổng ${C.length}: đúng ${ok}, trượt ${miss}, nhầm ${wrong}`);console.log(bad.join('\n'));

process.exit(typeof wrong!=='undefined' && (wrong||miss) ? 1 : 0);
