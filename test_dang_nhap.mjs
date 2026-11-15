// Test cổng đăng nhập hub Capital Square — KV giả, Telegram giả, KHÔNG gọi mạng.
// Chạy SAU build_site.py, TRƯỚC mỗi lần deploy:  node test_dang_nhap.mjs
import worker from './site/_worker.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
// D1 giả = SQLite THẬT trong bộ nhớ + đúng file schema → kiểm cả câu SQL
class D1Gia {
  constructor() { this.db = new DatabaseSync(':memory:'); this.db.exec(readFileSync(new URL('./d1/schema.sql', import.meta.url), 'utf8')); }
  prepare(sql) { const db = this.db; const mk = args => ({ args, bind: (...a) => mk(a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; } }); return mk([]); }
  async batch(ds) { this.db.exec('BEGIN'); try { const out = []; for (const d of ds) out.push(await d.run()); this.db.exec('COMMIT'); return out; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
}

class KVGia {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, String(v)); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; }
}
const tele = [];
globalThis.fetch = async (url, o) => { tele.push({ url: String(url), text: JSON.parse(o.body).text }); return new Response('{}'); };
const envMoi = (tg = true) => ({ CSQ: new KVGia(), DB: new D1Gia(), ADMIN_KEY: 'K-thu', ...(tg ? { TELEGRAM_BOT_TOKEN: 'gia', TELEGRAM_CHAT_ID: 'gia-chat' } : {}), ASSETS: { fetch: () => new Response('TRANG') } });
const O = 'https://csq.test';
const goi = (env, path, { than, tk, method, form } = {}) => worker.fetch(new Request(O + path, {
  method: method || (than || form ? 'POST' : 'GET'),
  headers: { ...(than ? { 'content-type': 'application/json' } : {}), ...(tk ? { 'x-csq-tk': tk } : {}) },
  body: than ? JSON.stringify(than) : form ? new URLSearchParams(form) : undefined,
}), env);
const dk = (env, b) => goi(env, '/api/dang-ky', { than: b }).then(async r => ({ st: r.status, ...(await r.json()) }));
const du = (env, tk) => goi(env, '/api/du-lieu', { tk }).then(async r => ({ st: r.status, ...(await r.json()) }));
const linkDuyet = () => (tele.at(-1).text.match(/\/duyet\?t=([a-f0-9]+)/) || [])[1];
const linkTB = () => (tele.at(-1).text.match(/\/duyet-tb\?t=([a-f0-9]+)/) || [])[1];
const choPhep = (env, kq = 'cho') => goi(env, '/duyet-tb', { form: { t: linkTB(), kq } });
// Quản trị: đăng nhập bằng form → cookie HttpOnly (khoá KHÔNG nằm trên URL)
const COOKIE = new Map();
async function qtCookie(env) {
  if (COOKIE.has(env)) return COOKIE.get(env);
  const r = await goi(env, '/quan-tri', { form: { khoa: env.ADMIN_KEY } });
  const c = (r.headers.get('set-cookie') || '').split(';')[0]; COOKIE.set(env, c); return c;
}
const qtGoi = async (env, form) => worker.fetch(new Request(O + '/quan-tri', { method: form ? 'POST' : 'GET', headers: { cookie: await qtCookie(env) }, body: form ? new URLSearchParams(form) : undefined }), env);

let dat = 0, truot = 0;
const kiem = (ten, dk_) => { if (dk_) { dat++; console.log('✅', ten); } else { truot++; console.log('❌', ten); } };
const SALE = { vai: 'sales', s: 'TEST Sale bo qua', p: '0912000001', e: 'sale@test.vn' };
const KHACH = { vai: 'khach', s: 'TEST Khach bo qua', p: '+84912000002', e: 'khach@test.vn' };

const env = envMoi();
// 1. Kiểm đầu vào
kiem('SĐT sai → 400 sdt', (await dk(env, { ...SALE, p: '123' })).err === 'sdt');
kiem('thiếu tên → 400 ten', (await dk(env, { ...SALE, s: 'a' })).err === 'ten');
kiem('email sai → 400 email', (await dk(env, { ...SALE, e: 'x' })).err === 'email');
kiem('vai lạ → 400 vai', (await dk(env, { ...SALE, vai: 'admin' })).err === 'vai');
kiem('đầu vào sai không ghi KV', env.CSQ.m.size === 0);

// 2. Đăng ký sale mới → chờ + Telegram có link duyệt
const r1 = await dk(env, SALE);
kiem('sale mới → tt cho + có token', r1.ok && r1.tt === 'cho' && /^[a-f0-9]{48}$/.test(r1.tk));
kiem('Telegram báo XIN VÀO kèm link /duyet', tele.at(-1).text.includes('XIN VÀO') && !!linkDuyet());
kiem('Telegram KHÔNG chứa email (giảm dữ liệu chuyển ra nước ngoài)', !tele.at(-1).text.includes('sale@test.vn'));
const dy1 = linkDuyet();
kiem('chưa duyệt → /api/du-lieu 403 cho', (await du(env, r1.tk)).err === 'cho');
kiem('không token → 401', (await du(env, '')).st === 401);
kiem('token bịa → 401', (await du(env, 'a'.repeat(48))).st === 401);
kiem('bấm đăng ký lại khi đang chờ → không spam Telegram', (await dk(env, SALE), tele.length === 1));

// 3. Trang duyệt: GET không duyệt, POST duyệt, dùng 1 lần
const g = await goi(env, '/duyet?t=' + dy1);
kiem('GET /duyet → trang xác nhận 200', g.status === 200 && (await g.text()).includes('Duyệt vai SALE'));
kiem('GET không tự duyệt', (await du(env, r1.tk)).err === 'cho');
const pz = await goi(env, '/duyet', { form: { t: dy1, kq: 'sales' } });
kiem('POST duyệt sale → 200', pz.status === 200);
const d1 = await du(env, r1.tk);
kiem('sale đã duyệt nhận ĐỦ dữ liệu (KB đủ, có Drive)', d1.ok && d1.vai === 'sales' && d1.du_lieu.KB.length >= 40 && (d1.du_lieu.META.thu_muc_drive || []).length > 0);
kiem('link duyệt dùng lần 2 → 410', (await goi(env, '/duyet', { form: { t: dy1, kq: 'khach' } })).status === 410);

// 4. Khách: duyệt vai khách → dữ liệu bị cắt ở máy chủ
const r2 = await dk(env, KHACH);
kiem('SĐT +84 chuẩn hoá về 0…', !!(await env.CSQ.get('tk_0912000002')));
await goi(env, '/duyet', { form: { t: linkDuyet(), kq: 'khach' } });
const d2 = await du(env, r2.tk);
kiem('khách vào được, vai khach', d2.ok && d2.vai === 'khach');
kiem('khách KHÔNG nhận hỏi đáp (viết cho sale)', d2.du_lieu.KB.length === 0);
kiem('sale nhận kịch bản telesales đủ phần', d1.du_lieu.TS && d1.du_lieu.TS.kich_ban.length >= 2 && d1.du_lieu.TS.tu_choi.length >= 5 && d1.du_lieu.TS.follow_up.length >= 5);
kiem('khách KHÔNG nhận kịch bản telesales', !('TS' in d2.du_lieu));
kiem('khách KHÔNG nhận link Drive', !('thu_muc_drive' in d2.du_lieu.META));
kiem('khách KHÔNG nhận thẻ tổng quan nội bộ', d2.du_lieu.META.the_tong_quan.every(t => !t.noi_bo));
kiem('khách KHÔNG nhận ghi chú/nguồn/mã pháp lý suy luận của tòa', d2.du_lieu.TOA.every(t => !('ghi_chu' in t) && !('nguon' in t) && !('cong_van_du_dk_ban' in t) && t.ma_phap_ly === null));
kiem('khách: người nước ngoài → lời chờ xác nhận, không lộ mâu thuẫn', d2.du_lieu.TOA.filter(t => t.nguoi_nuoc_ngoai).every(t => /chờ xác nhận/.test(t.nguoi_nuoc_ngoai)));
kiem('khách: tòa Square District → "chưa nhận hồ sơ", KHÔNG ngầm hứa đường cọc', (() => { const sd = d2.du_lieu.TOA.filter(t => t.phan_khu === 'Square District' && t.nguoi_nuoc_ngoai); return sd.length > 0 && sd.every(t => /chưa nhận hồ sơ/.test(t.nguoi_nuoc_ngoai) && !/đặt cọc/.test(t.nguoi_nuoc_ngoai)); })());
kiem('khách KHÔNG nhận CSBH hết hiệu lực', d2.du_lieu.CS.length > 0 && d2.du_lieu.CS.every(c => c.trang_thai !== 'het-hieu-luc'));
kiem('khách KHÔNG nhận lưu ý/ghi chú nội bộ của CSBH', d2.du_lieu.CS.every(c => !('luu_y' in c) && !('nguon' in c) && !('cong_thuc_phieu' in c) && (c.phuong_an || []).every(p => !('ghi_chu' in p))));
kiem('khách KHÔNG nhận ghi chú/cảnh báo mặt bằng', Object.values(d2.du_lieu.MB).every(t => !('canh_bao' in t) && !('nguon' in t) && t.mat_bang_loai.every(l => l.can.every(c => !('ghi_chu' in c)))));
const cv = d2.du_lieu.META.cong_van || [];
kiem('khách: công văn bỏ câu nội bộ (tên file, bản chép)', cv.length === 7 && cv.every(c => !/tên file|bản chép|drive/i.test(c.noi_dung)));
kiem('khách: GIỮ dòng cấm người nước ngoài của CV 8789', /không cho phép người nước ngoài/.test((cv.find(c => c.so.startsWith('8789')) || {}).noi_dung || ''));
const soiKhoa = (o, dd = []) => { if (Array.isArray(o)) o.forEach(x => soiKhoa(x, dd)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (/^(ghi_chu|luu_y|nguon|canh_bao|vi_tri)$|_ghi_chu$/.test(k)) dd.push(k); soiKhoa(v, dd); } return dd; };
kiem('không còn trường ghi chú/lưu ý/nguồn ở BẤT KỲ tầng nào của gói khách', soiKhoa(d2.du_lieu).length === 0);
kiem('lọc không cắt mất số liệu S4 (cọc, CK 8/12%)', (() => { const c = d2.du_lieu.CS.find(x => x.id.startsWith('s4')); return c && c.coc === 100000000 && [8, 12].every(n => c.phuong_an.some(p => p.chiet_khau_pct === n)); })());
kiem('khách KHÔNG nhận phương án 95% đang tạm dừng tư vấn', d2.du_lieu.CS.every(c => c.phuong_an.every(p => !/95%/.test(p.ten))) && d1.du_lieu.CS.some(c => c.phuong_an.some(p => /95%/.test(p.ten))));
kiem('khách KHÔNG nhận Early Birds (ngoài CSBH) ở chính sách lẫn thẻ tổng quan', d2.du_lieu.CS.every(c => !c.uu_dai_them.length) && !/Early Birds/.test(JSON.stringify(d2.du_lieu.META)));
kiem('sale VẪN nhận Early Birds kèm hạn booking', d1.du_lieu.CS.some(c => (c.uu_dai_them || []).some(u => u.han_booking === '2026-09-26')));
kiem('khách nhận chân trang bản khách (có giới hạn tư vấn, không "nội bộ")', /không phải tư vấn pháp lý/.test(d2.du_lieu.META.phap_ly_ngan) && !/nội bộ/i.test(d2.du_lieu.META.phap_ly_ngan) && !('phap_ly_ngan_khach' in d2.du_lieu.META));
kiem('lọc giữ dòng pháp lý chân trang (không cam kết + sổ hồng)', /Không cam kết lợi nhuận/.test(d2.du_lieu.META.phap_ly_ngan) && /sổ hồng/.test(d2.du_lieu.META.phap_ly_ngan));
kiem('không lọt chữ nội bộ nào vào gói dữ liệu khách', !/OCR|poster|suy luận|luật sư kiểm|Stacking từ quản lý|nhóm chat|thông báo quỹ hàng|lớp chữ/i.test(JSON.stringify(d2.du_lieu)));
kiem('cắt vai không làm hỏng bản sale (dữ liệu gốc còn nguyên)', (await du(env, r1.tk)).du_lieu.TOA.some(t => t.ghi_chu.length));

// 5. BẢO MẬT: đã duyệt + máy mới → KHÔNG vào thẳng; CEO phải "Cho phép" qua Telegram (SĐT công khai trên mạng)
const tenCu = JSON.parse(await env.CSQ.get('tk_0912000002')).s;
const r3 = await dk(env, { ...KHACH, vai: 'sales', s: 'Ke Gia Mao', e: 'gia@x.vn' });
kiem('máy mới của tài khoản đã duyệt → CHỜ, không vào thẳng', r3.ok && r3.tt === 'cho' && r3.may_moi && r3.vai === 'khach');
kiem('máy mới chưa cho phép → KHÔNG nhận dữ liệu', (await du(env, r3.tk)).err === 'cho');
kiem('máy mới chưa cho phép → KHÔNG ghi hoạt động', (await goi(env, '/api/act', { than: { tk: r3.tk, ev: [{ e: 'vao' }] } })).status === 401);
kiem('người lạ nhập SĐT KHÔNG sửa được tên/email chủ tài khoản', JSON.parse(await env.CSQ.get('tk_0912000002')).s === tenCu);
kiem('Telegram báo THIẾT BỊ MỚI kèm link cho phép', tele.at(-1).text.includes('THIẾT BỊ MỚI') && !!linkTB());
const gtb = await goi(env, '/duyet-tb?t=' + linkTB());
kiem('GET /duyet-tb chỉ hiện xác nhận, không cho phép', gtb.status === 200 && (await du(env, r3.tk)).err === 'cho');
const dyTB = linkTB();
await choPhep(env);
kiem('CEO cho phép → máy mới vào được, vẫn vai khach', (await du(env, r3.tk)).vai === 'khach');
kiem('link cho phép dùng lần 2 → 410', (await goi(env, '/duyet-tb', { form: { t: dyTB, kq: 'cho' } })).status === 410);
const r4 = await dk(env, { p: SALE.p });
await choPhep(env, 'tuchoi');
kiem('CEO từ chối thiết bị → máy đó 401, máy cũ vẫn vào', (await du(env, r4.tk)).st === 401 && (await du(env, r1.tk)).ok);
for (let i = 0; i < 3; i++) await dk(env, { p: SALE.p });
kiem('tối đa 3 thiết bị chờ/tài khoản → 429 (chặn spam Telegram)', (await dk(env, { p: SALE.p })).err === 'nhieu-tb');
// dọn 3 máy chờ để phần sau đo trần thiết bị
{ const t = JSON.parse(await env.CSQ.get('tk_0912000001')); for (const x of t.cho_tb) await env.CSQ.delete('ss_' + x.t); t.cho_tb = []; await env.CSQ.put('tk_0912000001', JSON.stringify(t)); }

// 6. Trần 10 thiết bị (mỗi máy phải được cho phép)
const tks = [];
for (let i = 0; i < 11; i++) { tks.push((await dk(env, { p: SALE.p })).tk); await choPhep(env); }
kiem('thiết bị thứ 11 đá máy cũ nhất', (await du(env, r1.tk)).st === 401 && (await du(env, tks.at(-1))).ok);
kiem('tối đa 10 phiên/tài khoản', JSON.parse(await env.CSQ.get('tk_0912000001')).tks.length === 10);

// 7. Đăng xuất
const tOut = tks.at(-1);
await goi(env, '/api/dang-xuat', { than: {}, tk: tOut });
kiem('đăng xuất huỷ đúng phiên đó', (await du(env, tOut)).st === 401 && (await du(env, tks.at(-2))).ok);

// 8. Quản trị
kiem('/quan-tri không cookie → chỉ form nhập khoá, không lộ danh sách', await goi(env, '/quan-tri').then(async r => r.status === 200 && !(await r.text()).includes('0912000001')));
kiem('/quan-tri?key= KHÔNG còn mở được (khoá trên URL bị bỏ)', await goi(env, '/quan-tri?key=K-thu').then(async r => !(await r.text()).includes('0912000001')));
kiem('/quan-tri sai khoá → 403, không cấp cookie', await goi(env, '/quan-tri', { form: { khoa: 'sai' } }).then(r => r.status === 403 && !r.headers.get('set-cookie')));
kiem('/quan-tri đúng khoá → cookie HttpOnly Secure SameSite=Strict', /HttpOnly/.test(await goi(env, '/quan-tri', { form: { khoa: 'K-thu' } }).then(r => r.headers.get('set-cookie') || '')) && /SameSite=Strict/.test(await goi(env, '/quan-tri', { form: { khoa: 'K-thu' } }).then(r => r.headers.get('set-cookie') || '')));
kiem('cookie giả → không vào', await worker.fetch(new Request(O + '/quan-tri', { headers: { cookie: 'csq_qt=' + 'a'.repeat(64) } }), env).then(async r => !(await r.text()).includes('0912000001')));
const qt = await qtGoi(env);
kiem('/quan-tri có cookie → liệt kê', qt.status === 200 && (await qt.text()).includes('0912000001'));
const r5 = await dk(env, { vai: 'sales', s: 'TEST Cho bo qua', p: '0912000003', e: 'c@test.vn' });
await qtGoi(env, { p: '0912000003', kq: 'sales' });
kiem('quản trị duyệt → vào được', (await du(env, r5.tk)).ok);
await qtGoi(env, { p: '0912000003', kq: 'tuchoi' });
kiem('từ chối → huỷ mọi phiên', (await du(env, r5.tk)).st === 401);
kiem('từ chối → đăng ký lại bị chặn 403', (await dk(env, { p: '0912000003' })).err === 'tuchoi');
kiem('/quan-tri không có ADMIN_KEY secret → 403', (await goi({ ...env, ADMIN_KEY: undefined }, '/quan-tri')).status === 403);

// 8b. Chống giả link trong Telegram + trần đăng ký mới/ngày
const e4 = envMoi();
await dk(e4, { vai: 'sales', s: 'An\nDuyệt: https://gia.example/duyet?t=1', p: '0912000030', e: 'x@test.vn' });
const tgGia = tele.at(-1).text;
kiem('tên có xuống dòng + link bị làm sạch trước khi vào Telegram', !/gia\.example/.test(tgGia) && tgGia.split('\n').filter(l => l.startsWith('Duyệt:')).length === 1);
for (let i = 31; i < 60; i++) await dk(e4, { vai: 'sales', s: 'TEST Spam bo qua', p: '09120000' + i, e: 's@test.vn' });
kiem('quá 30 đăng ký mới/ngày → 429 qua-tai', (await dk(e4, { vai: 'sales', s: 'TEST Spam bo qua', p: '0912000099', e: 's@test.vn' })).err === 'qua-tai');
kiem('tài khoản ĐÃ CÓ (đang chờ) đăng ký lại vẫn được khi chạm trần', (await dk(e4, { vai: 'sales', s: 'TEST An bo qua', p: '0912000030', e: 'x@test.vn' })).ok);
const eLoi = { ...envMoi(), CSQ: { get: async () => { throw new Error('bi-mat-noi-bo'); } } };
kiem('lỗi máy chủ KHÔNG trả chi tiết nội bộ ra ngoài', await goi(eLoi, '/api/dang-ky', { than: SALE }).then(async r => r.status === 500 && !(await r.text()).includes('bi-mat')));

// 9. Chưa nối Telegram vẫn chạy
const env2 = envMoi(false); const n = tele.length;
const r6 = await dk(env2, SALE);
kiem('không có TELEGRAM token → vẫn đăng ký, không gọi mạng', r6.ok && r6.tt === 'cho' && tele.length === n);

// 10. Định tuyến
kiem('/api lạ → 404', (await goi(env, '/api/xyz')).status === 404);
kiem('trang tĩnh đi qua ASSETS', (await (await goi(env, '/')).text()) === 'TRANG');

// 11. Vai QUẢN TRỊ + ghi hoạt động + báo cáo
const e3 = envMoi();
const act = (tk, ev) => goi(e3, '/api/act', { than: { tk, ev } }).then(r => r.status);
const bc = (tk, n = 7) => goi(e3, '/api/bao-cao?so_ngay=' + n, { tk }).then(async r => ({ st: r.status, ...(await r.json()) }));
kiem('đăng ký công khai KHÔNG chọn được vai admin', (await dk(e3, { ...SALE, vai: 'admin' })).err === 'vai');
const ad = await dk(e3, { vai: 'sales', s: 'TEST Admin bo qua', p: '0912000010', e: 'a@test.vn' });
await qtGoi(e3, { p: '0912000010', kq: 'admin' });
const dA = await du(e3, ad.tk);
kiem('/quan-tri gán admin → vào với vai admin, đủ dữ liệu như sale', dA.ok && dA.vai === 'admin' && dA.du_lieu.KB.length >= 40 && (dA.du_lieu.META.thu_muc_drive || []).length > 0);
kiem('máy mới của ADMIN → phải chờ cho phép, vai vẫn admin', await dk(e3, { p: '0912000010', vai: 'khach' }).then(r => r.tt === 'cho' && r.vai === 'admin'));
const s1 = await dk(e3, SALE); await qtGoi(e3, { p: SALE.p, kq: 'sales' });
const s2 = await dk(e3, { vai: 'sales', s: 'TEST Sale2 bo qua', p: '0912000004', e: 's2@test.vn' }); await qtGoi(e3, { p: '0912000004', kq: 'sales' });
const cho = await dk(e3, { vai: 'khach', s: 'TEST Cho bo qua', p: '0912000005', e: 'c@test.vn' });
kiem('sale KHÔNG xem được báo cáo (403)', (await bc(s1.tk)).st === 403);
kiem('chưa đăng nhập KHÔNG xem được báo cáo', (await bc('')).st === 403);
kiem('/api/act token bịa → 401', (await act('b'.repeat(48), [{ e: 'vao' }])) === 401);
kiem('/api/act tài khoản đang chờ → 401 (không ghi)', (await act(cho.tk, [{ e: 'vao' }])) === 401);
kiem('/api/act sale hợp lệ → 200', (await act(s1.tk, [{ e: 'vao' }, { e: 'tab', d: 'chinh-sach' }, { e: 'tab', d: 'chinh-sach' }, { e: 'toa', d: 'S4' }, { e: 'hoi', d: 'cọc bao nhiêu', id: 'coc-va-ttdccn' }, { e: 'hoi', d: 'hầm có sạc xe điện không' }, { e: 'lich', d: 'thuong' }, { e: 'xau', d: 'x' }])) === 200);
await act(s1.tk, [{ e: 'ts', d: 'tc-4' }]);
kiem('gộp theo NGÀY + NGƯỜI vào 1 khoá KV', [...e3.CSQ.m.keys()].filter(k => k.startsWith('hd_')).length === 1);
const B = await bc(ad.tk);
const u1 = B.nguoi.find(u => u.p === SALE.p), u2 = B.nguoi.find(u => u.p === '0912000004');
kiem('admin xem báo cáo → 200, đếm tài khoản đúng', B.st === 200 && B.tai_khoan.sales === 2 && B.tai_khoan.cho === 1 && B.tai_khoan.admin === 1);
kiem('báo cáo đếm lượt chép kịch bản telesales', u1.n.ts === 1);
kiem('báo cáo đếm đúng thao tác của sale (bỏ sự kiện lạ)', u1.n.vao === 1 && u1.tab['chinh-sach'] === 2 && u1.toa.S4 === 1 && u1.hoi === 2 && u1.hoi_truot === 1 && u1.n.lich === 1 && !u1.n.xau);
kiem('sale chưa vào vẫn có dòng (ngày HĐ 0) để thấy ai im lặng', u2 && u2.ngay_hd === 0);
kiem('câu hỏi trượt vào danh sách bồi kho', B.hoi_truot.some(h => h.q.includes('sạc xe điện')));
kiem('chủ đề hỏi nhiều đếm theo mục KB', B.hoi_nhieu.some(h => h.id === 'coc-va-ttdccn' && h.n === 1));
kiem('danh sách chờ duyệt có người đang chờ', B.cho_duyet.length === 1 && B.cho_duyet[0].p === '0912000005');
await act(ad.tk, [{ e: 'vao' }]);
kiem('người hoạt động theo ngày KHÔNG tính tài khoản quản trị', (await bc(ad.tk)).theo_ngay.at(-1).nguoi === 1);
kiem('chuỗi theo ngày đủ số ngày yêu cầu', (await bc(ad.tk, 14)).theo_ngay.length === 14 && B.theo_ngay.length === 7);
kiem('số ngày bị kẹp 1–30', (await bc(ad.tk, 999)).theo_ngay.length === 30);
const loTruoc = JSON.parse([...e3.CSQ.m.entries()].find(([k]) => k.startsWith('hd_') && k.endsWith(SALE.p))[1]).w;
for (let i = 0; i < 25; i++) await act(s1.tk, [{ e: 'tab', d: 'toa' }]);
const hd = JSON.parse([...e3.CSQ.m.entries()].find(([k]) => k.startsWith('hd_') && k.endsWith(SALE.p))[1]);
kiem('trần 20 lô/người/ngày giữ hạn mức KV', hd.w === 20 && hd.tab.toa === 20 - loTruoc);
// chốt hẹn
const hen = (tk, b) => goi(e3, '/api/hen', { than: b, tk }).then(async r => ({ st: r.status, ...(await r.json()) }));
kiem('/api/hen thiếu tên/giờ → 400', (await hen(s1.tk, { ten: '', gio: '' })).st === 400);
kiem('/api/hen chưa đăng nhập → 403', (await hen('', { ten: 'anh Nam', gio: '9h CN' })).st === 403);
const nTele = tele.length;
kiem('sale chốt hẹn (dù đã chạm trần lô ghi) → vẫn ghi', (await hen(s1.tk, { ten: 'anh Nam\nhttps://x.y', gio: '9h sáng CN 28/9', ht: 'video' })).ghi === true);
kiem('Telegram báo HẸN MỚI, đã làm sạch link trong tên', tele.length === nTele + 1 && tele.at(-1).text.includes('HẸN MỚI') && !tele.at(-1).text.includes('https://x.y'));
kiem('báo cáo đếm hẹn của sale', (await bc(ad.tk)).nguoi.find(u => u.p === SALE.p).n.hen === 1);
// duyệt trong tab Báo cáo
const ql = (tk, b) => goi(e3, '/api/quan-ly', { than: b, tk }).then(async r => ({ st: r.status, ...(await r.json()) }));
kiem('sale KHÔNG gọi được /api/quan-ly', (await ql(s1.tk, { p: '0912000005', kq: 'khach' })).st === 403);
kiem('admin duyệt khách ngay trong báo cáo', (await ql(ad.tk, { p: '0912000005', kq: 'khach' })).ok && (await du(e3, cho.tk)).vai === 'khach');
kiem('/api/quan-ly KHÔNG gán được vai admin', (await ql(ad.tk, { p: SALE.p, kq: 'admin' })).st === 400);
// khách đặt lịch xem nhà mẫu
const ngayVNt = (n = 0) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const dl = (tk, b) => goi(e3, '/api/dat-lich', { than: b, tk }).then(async r => ({ st: r.status, ...(await r.json()) }));
const LICH = { ht: 'nha-mau', ngay: ngayVNt(1), buoi: 'sang', ghi_chu: 'căn 2PN\nhttps://gia.x', dong_y: true };
kiem('sale KHÔNG dùng /api/dat-lich (chỉ khách)', (await dl(s1.tk, LICH)).st === 403);
kiem('chưa đăng nhập → 403', (await dl('', LICH)).st === 403);
kiem('không tick đồng ý → 400', (await dl(cho.tk, { ...LICH, dong_y: false })).err === 'dong-y');
kiem('ngày quá khứ → 400', (await dl(cho.tk, { ...LICH, ngay: ngayVNt(-1) })).err === 'ngay');
kiem('ngày quá 60 ngày → 400', (await dl(cho.tk, { ...LICH, ngay: ngayVNt(61) })).err === 'ngay');
const nT = tele.length;
kiem('khách đặt lịch hợp lệ → 200', (await dl(cho.tk, LICH)).ok);
const khLh = [...e3.CSQ.m.keys()].filter(k => k.startsWith('lh_'));
kiem('LƯU KV trước (lh_) kèm dấu đồng ý', khLh.length === 1 && /v1/.test(JSON.parse(e3.CSQ.m.get(khLh[0])).dong_y));
const tg = tele.at(-1).text;
kiem('Telegram KHÁCH ĐẶT LỊCH có tên + SĐT để gọi lại, đã làm sạch link', tele.length === nT + 1 && tg.includes('KHÁCH ĐẶT LỊCH') && tg.includes('0912000005') && !tg.includes('gia.x'));
await dl(cho.tk, LICH); await dl(cho.tk, LICH);
kiem('quá 3 lần/ngày → 429', (await dl(cho.tk, LICH)).st === 429);
const BL = await bc(ad.tk);
kiem('báo cáo admin có danh sách khách đặt lịch', BL.dat_lich.length === 3 && BL.dat_lich[0].p === '0912000005');
kiem('báo cáo đếm sự kiện đặt lịch của khách', BL.nguoi.find(u => u.p === '0912000005').n.dl === 3);
// bảng hàng + ảnh theo vai
const U_ad = (await du(e3, ad.tk)).du_lieu.UNITS, U_sa = (await du(e3, s1.tk)).du_lieu.UNITS, U_kh = (await du(e3, cho.tk)).du_lieu.UNITS;
kiem('bảng hàng có căn (9 căn giỏ FBG)', U_sa.length >= 9);
kiem('giá tính hoa hồng CHỈ admin thấy', U_ad.some(u => u.gia_hh) && U_sa.every(u => !('gia_hh' in u)) && U_kh.every(u => !('gia_hh' in u)));
kiem('sale thấy phiếu tính giá + giá TT nhanh + cảnh báo', U_sa.some(u => Object.keys(u.ptg || {}).length === 3) && U_sa.some(u => u.gia_tts) && U_sa.some(u => (u.canh_bao || []).length));
kiem('khách chỉ nhận số liệu căn + giá tổng/tiến độ/vay + chỉ căn', U_kh.length === U_sa.length && U_kh.every(u => !('ptg' in u) && !('gia_tts' in u) && !('the_fbg' in u) && !('canh_bao' in u) && !('nguon' in u)) && U_kh.some(u => u.gia_tien_do && u.chi_can));
const anh = (tk, f) => worker.fetch(new Request(O + '/api/anh?f=' + encodeURIComponent(f), { headers: tk ? { 'x-csq-tk': tk } : {} }), e3).then(r => r.status);
kiem('/api/anh không phiên → 401', (await anh('', 'chi-can/C1-1703.jpg')) === 401);
kiem('/api/anh tên file lạ (../) → 400', (await anh(s1.tk, '../worker.js')) === 400);
kiem('khách xem ảnh chỉ căn → 200', (await anh(cho.tk, 'chi-can/C1-1703.jpg')) === 200);
kiem('khách KHÔNG xem phiếu tính giá / thẻ FBG → 403', (await anh(cho.tk, 'ptg/C1-1703-vay.jpg')) === 403 && (await anh(cho.tk, 'the-fbg/C1-1703.jpg')) === 403);
kiem('sale xem phiếu tính giá → 200', (await anh(s1.tk, 'ptg/C1-1703-vay.jpg')) === 200);
kiem('tải ảnh trực tiếp /anh/... bị chặn 404', (await goi(e3, '/anh/ptg/C1-1703-vay.jpg')).status === 404);
// màn chọn dự án — giỏ hàng các dự án
const DA_ad = (await du(e3, ad.tk)).du_lieu.DU_AN, DA_sa = (await du(e3, s1.tk)).du_lieu.DU_AN, DA_kh = (await du(e3, cho.tk)).du_lieu.DU_AN;
kiem('sale/admin nhận danh sách ≥10 dự án, có Capital Square (hub)', DA_sa.du_an.length >= 10 && DA_sa.du_an.some(x => x.co_hub && x.slug === 'capital-square'));
const coCot = (da, re) => da.du_an.some(p => p.bang.some(b => b.cot.some(c => re.test(c)) || b.dong.some(r => Object.keys(r).some(k => re.test(k)))));
kiem('admin thấy cột nội bộ (Naked / Map giỏ)', coCot(DA_ad, /Naked/) && coCot(DA_ad, /Map giỏ/));
kiem('sale KHÔNG thấy cột nội bộ ở mọi dự án (cả cột lẫn ô)', !coCot(DA_sa, /Naked|hoa hồng|Map giỏ/i));
kiem('sale vẫn đủ số căn mỗi dự án', DA_sa.du_an.every((p, i) => p.so_can === DA_ad.du_an[i].so_can));
kiem('khách KHÔNG nhận giỏ hàng dự án khác', DA_kh === undefined);
kiem('khách KHÔNG ghi hẹn được', (await hen(cho.tk, { ten: 'x y', gio: '9h' })).st === 403);
kiem('/api/quan-ly KHÔNG sửa/từ chối được tài khoản admin', (await ql(ad.tk, { p: '0912000010', kq: 'tuchoi' })).err === 'khong-sua-admin');

// 12. KHO KHÁCH (D1)
{
const e5 = envMoi();
const g5 = (path, o) => goi(e5, path, o).then(async r => ({ st: r.status, ...(await r.json()) }));
const qt5 = async form => { const r = await goi(e5, '/quan-tri', { form: { khoa: 'K-thu' } }); const c = (r.headers.get('set-cookie') || '').split(';')[0]; return worker.fetch(new Request(O + '/quan-tri', { method: 'POST', headers: { cookie: c }, body: new URLSearchParams(form) }), e5); };
const tao = async (p, vai, s) => { const r = await dk(e5, { vai: vai === 'admin' ? 'sales' : vai, s, p, e: 'x@test.vn' }); await qt5({ p, kq: vai }); return r.tk; };
const tA = await tao('0912000060', 'admin', 'TEST Admin kho bo qua'), tS1 = await tao('0912000061', 'sales', 'TEST Sale A bo qua'), tS2 = await tao('0912000062', 'sales', 'TEST Sale B bo qua'), tK = await tao('0912000063', 'khach', 'TEST Khach kho bo qua');
const nap = (tk, b) => g5('/api/kho/nap', { than: b, tk });
kiem('sale KHÔNG nạp kho được', (await nap(tS1, { ds: [{ sdt: '0901111111' }] })).st === 403);
kiem('khách KHÔNG đọc "khách của tôi"', (await g5('/api/khach-cua-toi', { tk: tK })).st === 403);
const DS = [{ ten: 'Nguyễn An', sdt: '0901 111 111', nguon: 'Ads' }, { ten: 'Trần Bình', sdt: '+84901222222' }, { ten: 'Lê Cường', sdt: '0901333333', nhu_cau: '2PN' }, { ten: 'Phạm Dung', sdt: '0901444444' },
  { ten: 'Trùng file', sdt: '0901111111' }, { ten: 'Số lỗi', sdt: '12345' }];
const n1 = await nap(tA, { ds: DS, nguon: 'TEST lô 1', chia: 'deu' });
kiem('nạp: 4 mới, 1 trùng file, 1 số lỗi, chia đều 4', n1.ok && n1.them === 4 && n1.trung_file === 1 && n1.loi === 1 && n1.chia === 4);
const n2 = await nap(tA, { ds: [{ sdt: '0901111111' }, { ten: 'Mới E', sdt: '0901555555' }], chia: 'sale:0912000062' });
kiem('nạp lại: số đã có trong kho bỏ qua; giao thẳng 1 sale', n2.them === 1 && n2.trung_kho === 1 && n2.giao_cho === '0912000062');
kiem('giao cho số không phải sale → 400', (await nap(tA, { ds: [{ sdt: '0901666666' }], chia: 'sale:0912000063' })).st === 400);
const k1 = await g5('/api/khach-cua-toi', { tk: tS1 }), k2 = await g5('/api/khach-cua-toi', { tk: tS2 });
kiem('chia đều: A 2 khách, B 2+1 khách', k1.ds.length === 2 && k2.ds.length === 3);
kiem('sale chỉ thấy khách của mình, không thấy sale_p', k1.ds.every(k => !('sale_p' in k)) && !k1.ds.some(k => k2.ds.some(x => x.id === k.id)));
const kA = k1.ds[0], kB = k2.ds[0];
kiem('sale KHÔNG sửa khách của người khác → 403', (await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: kB.id, trang_thai: 'da-goi' } })).st === 403);
kiem('trạng thái lạ → 400', (await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: kA.id, trang_thai: 'xyz' } })).st === 400);
const nT5 = tele.length;
const cn = await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: kA.id, trang_thai: 'hen-xem', ghi_chu: 'Hẹn CN 9h\nhttps://x.y', hen_lai: '2099-01-01' } });
kiem('cập nhật hẹn xem → ok + Telegram (đuôi 4 số, không link)', cn.ok && tele.length === nT5 + 1 && /HẸN XEM/.test(tele.at(-1).text) && /…\d{4}/.test(tele.at(-1).text) && !tele.at(-1).text.includes('x.y'));
const kA2 = (await g5('/api/khach-cua-toi?ls=' + kA.id, { tk: tS1 }));
kiem('lưu trạng thái + ghi chú + hẹn, lần chăm tăng, có lịch sử', (() => { const k = kA2.ds.find(x => x.id === kA.id); return k.trang_thai === 'hen-xem' && k.lan_cham === 1 && k.hen_lai === '2099-01-01' && kA2.lich_su.length >= 3; })());
kiem('không đổi gì → không ghi', (await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: kA.id, trang_thai: 'hen-xem' } })).khong_doi === true);
kiem('DNC → xoá hẹn gọi lại', (await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: k1.ds[1].id, trang_thai: 'dnc', hen_lai: '2099-01-01' } })).hen_lai === null);
const kho = await g5('/api/kho', { tk: tA });
kiem('admin xem kho: tổng 5, thấy sale_p, thống kê theo sale', kho.ok && kho.tong.n === 5 && kho.ds.every(k => 'sale_p' in k) && kho.theo_sale.length === 2);
kiem('sale KHÔNG xem /api/kho', (await g5('/api/kho', { tk: tS1 })).st === 403);
kiem('lọc kho theo trạng thái', (await g5('/api/kho?tt=hen-xem', { tk: tA })).ds.length === 1);
const gt = await g5('/api/kho/giao', { tk: tA, than: { ids: [kB.id], sale_p: '0912000061' } });
kiem('admin giao lại khách → sang sale A', gt.ok && (await g5('/api/khach-cua-toi', { tk: tS1 })).ds.some(k => k.id === kB.id));
await g5('/api/kho/giao', { tk: tA, than: { ids: [kB.id], sale_p: null } });
kiem('thu hồi về kho → chưa giao', (await g5('/api/kho?sale=chua', { tk: tA })).ds.some(k => k.id === kB.id));
kiem('chia đều khách chưa giao', (await g5('/api/kho/giao', { tk: tA, than: { chia_deu_chua_giao: true } })).chia === 1);
const nD = await g5('/api/dat-lich', { tk: tK, than: { ht: 'video', ngay: ngayVNt(2), buoi: 'toi', ghi_chu: 'căn 3PN', dong_y: true } });
kiem('khách tự đặt lịch → tự vào kho (nguồn Hub)', nD.ok && (await g5('/api/kho?q=0912000063', { tk: tA })).ds.some(k => k.nguon === 'Hub - khách đặt lịch'));
// thi đua
const td = tk => g5('/api/thi-dua?ky=tuan', { tk });
kiem('khách KHÔNG xem thi đua', (await td(tK)).st === 403);
const T1 = await td(tS1), a1 = T1.ds.find(x => x.toi);
kiem('sale A: hẹn xem tính 1 lần (+10) và chăm 2 khách khác nhau (+2)', a1 && a1.ct['hen-xem'] === 1 && a1.ct.cham === 2 && a1.diem === 12);
await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: kA.id, trang_thai: 'da-goi' } });
await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: kA.id, trang_thai: 'hen-xem' } });
await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: kA.id, ghi_chu: 'gọi thêm lần nữa' } });
const a1b = (await td(tS1)).ds.find(x => x.toi);
kiem('CHỐNG GIAN LẬN: bật tắt hẹn xem + chăm lại cùng khách KHÔNG cộng thêm', a1b.ct['hen-xem'] === 1 && a1b.ct.cham === 2 && a1b.diem === 12);
await g5('/api/khach/cap-nhat', { tk: tS1, than: { id: kA.id, trang_thai: 'coc' } });
kiem('cọc lần đầu +50', (await td(tS1)).ds.find(x => x.toi).diem === 62);
await goi(e5, '/api/hen', { than: { ten: 'anh X', gio: '9h CN', ht: 'nha-mau' }, tk: tS2 });
const T2 = await td(tS2), b2 = T2.ds.find(x => x.toi);
kiem('nút "chốt được hẹn" tính riêng (+5), không lẫn hẹn từ kho', b2.ct['hen-nut'] === 1);
kiem('xếp hạng: A hạng 1, đúng thứ tự điểm', T2.ds[0].ten === 'TEST Sale A bo qua' && T2.ds[0].hang === 1 && T2.ds.every((x, i) => i === 0 || T2.ds[i - 1].diem >= x.diem));
kiem('bảng thi đua KHÔNG lộ SĐT sale/khách', !/09120000|0901\d{6}/.test(JSON.stringify(T2)));
kiem('chỉ đánh dấu "toi" đúng 1 dòng', T2.ds.filter(x => x.toi).length === 1);
kiem('kỳ tháng / 30 ngày chạy được', (await g5('/api/thi-dua?ky=thang', { tk: tS1 })).ok && (await g5('/api/thi-dua?ky=30', { tk: tA })).ok);
kiem('chưa bật D1 → 503 (không sập)', (await goi({ ...e5, DB: undefined }, '/api/khach-cua-toi', { tk: tS1 })).status === 503);
}

console.log(`\n${dat}/${dat + truot} ca đạt`);
process.exit(truot ? 1 : 0);
