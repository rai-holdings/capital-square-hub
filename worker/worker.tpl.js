// Cổng đăng nhập + API dữ liệu cho hub Capital Square (Cloudflare Pages advanced mode).
// build_site.py bơm dữ liệu vào /*__DU_LIEU__*/ rồi ghi ra site/_worker.js — KHÔNG sửa site/_worker.js tay.
// Mô hình giống tailieuduan.com: SĐT + tên + email + vai → chờ CEO duyệt (link Telegram dùng 1 lần)
// → phiên token (tối đa 10 thiết bị). Khác tailieuduan: dữ liệu KHÔNG nằm trong HTML, chỉ trả qua
// /api/du-lieu khi phiên đã duyệt, và cắt theo vai NGAY Ở MÁY CHỦ.
//
// Binding: KV `CSQ`. Secret: ADMIN_KEY (bảng quản trị), TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (tuỳ chọn —
// chưa cắm thì vẫn chạy, CEO duyệt qua /quan-tri).
// Khoá KV: tk_<sđt> {p,s,e,vai,tt:'cho'|'duyet'|'tuchoi',tks:[],tao,sua} · ss_<token> → sđt (TTL 180 ngày)
//          dy_<token duyệt> → sđt (TTL 7 ngày, xoá khi dùng)

const DU_LIEU = /*__DU_LIEU__*/null;
const SITE = 'Capital Square hub';
const MAX_THIET_BI = 10;
const TTL_PHIEN = 180 * 86400;
const TTL_DUYET = 7 * 86400;

const json = (o, st = 200) => new Response(JSON.stringify(o), {
  status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const html = (body, st = 200) => new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${SITE}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1c2230}button{font:inherit;padding:10px 16px;border-radius:8px;border:0;margin:4px 6px 4px 0;cursor:pointer;background:#16324f;color:#fff}button.no{background:#b3261e}button.alt{background:#b8893b}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}.m{color:#5d6576;font-size:14px}</style></head><body>${body}</body></html>`,
  { status: st, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chuanSdt = p => { let x = String(p || '').replace(/[^\d+]/g, ''); if (x.startsWith('+84')) x = '0' + x.slice(3); else if (x.startsWith('84') && x.length === 11) x = '0' + x.slice(2); return /^0\d{9}$/.test(x) ? x : null; };
const rand = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
const gioVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 16);
const TEN_VAI = { sales: 'Sale', khach: 'Khách hàng' };            // vai CHỌN ĐƯỢC khi đăng ký công khai
const TEN_VAI_DAY = { ...TEN_VAI, admin: 'Quản trị' };            // admin CHỈ gán ở /quan-tri (cần ADMIN_KEY)
const ngayVN = (lui = 0) => new Date(Date.now() + 7 * 3600e3 - lui * 86400e3).toISOString().slice(0, 10);

async function docTK(env, p) { const v = await env.CSQ.get('tk_' + p); return v ? JSON.parse(v) : null; }
// Tài khoản bị từ chối tự xoá sau 30 ngày (hạn lưu dữ liệu cá nhân — Luật BVDLCN 91/2025)
async function ghiTK(env, tk) { tk.sua = gioVN(); await env.CSQ.put('tk_' + tk.p, JSON.stringify(tk), tk.tt === 'tuchoi' ? { expirationTtl: 30 * 86400 } : undefined); }

async function capPhien(env, tk) {
  const t = rand();
  tk.tks = [...(tk.tks || []), t];
  while (tk.tks.length > MAX_THIET_BI) { const cu = tk.tks.shift(); await env.CSQ.delete('ss_' + cu); }
  await env.CSQ.put('ss_' + t, tk.p, { expirationTtl: TTL_PHIEN });
  await ghiTK(env, tk);
  return t;
}

async function baoTelegram(env, dong) {
  try {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
    const r = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: dong.filter(Boolean).join('\n'), disable_web_page_preview: true }) });
    return r.ok;
  } catch (_) { return false; }
}

// Đọc phiên từ header x-csq-tk → tài khoản (hoặc null)
async function phienTu(env, req) {
  const t = req.headers.get('x-csq-tk') || '';
  if (!/^[a-f0-9]{48}$/.test(t)) return null;
  const p = await env.CSQ.get('ss_' + t);
  if (!p) return null;
  const tk = await docTK(env, p);
  if (!tk) return null;
  if ((tk.tks || []).includes(t)) return tk;
  // Máy mới của tài khoản đã duyệt, CEO chưa bấm "Cho phép" → coi như đang chờ (không nhận dữ liệu, không ghi hoạt động)
  if ((tk.cho_tb || []).some(x => x.t === t)) return { ...tk, tt: 'cho' };
  return null;
}
// Làm sạch chữ người dùng gõ: bỏ ký tự điều khiển/xuống dòng + đường link — chặn giả link duyệt trong tin Telegram
const sach = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/(https?:\/\/|www\.)\S*/gi, '').replace(/\s+/g, ' ').trim().slice(0, n);
const TRAN_DK_NGAY = 30;   // tối đa tài khoản MỚI mỗi ngày — chặn spam đốt hạn mức KV + Telegram
const TRAN_CHO_TB = 3;     // tối đa thiết bị đang chờ cho phép / tài khoản

// Cắt dữ liệu theo vai Ở MÁY CHỦ (giống tailieuduan: khách chỉ xem một phần). Khách KHÔNG nhận:
// hỏi đáp (viết cho sale, có "trả lời mẫu"), link Drive, thẻ nội bộ, mọi ghi chú/lưu ý/cảnh báo/nguồn nội bộ
// (OCR lỗi, poster lệch, suy luận pháp lý), CSBH hết hiệu lực. Còn: số liệu tòa, mặt bằng, điều khoản CSBH, công văn.
// Dữ liệu bóc từ tài liệu trộn ghi chú nội bộ vào chính các chuỗi (vd "5% (nhiều khả năng chưa VAT — OCR không chắc)").
// Với khách: đi qua MỌI chuỗi, bỏ cụm ngoặc rồi bỏ cả câu có dấu vết nội bộ. test_dang_nhap.mjs quét toàn gói để canh.
const NOI_BO = /OCR|poster|suy luận|tên file|lớp chữ|drive|không chắc|chưa xác|báo PR|tài trợ|nội bộ|mâu thuẫn|lệch|sai|luật sư|Stacking|web môi giới|đại lý|An Phú|kit\b|chép|ghép|\[/i;
// Trường nội bộ ở BẤT KỲ tầng nào (vd uu_dai_them[].ghi_chu) — bỏ cả trường, không cần soi chữ
const KHOA_NOI_BO = /^(ghi_chu|luu_y|nguon|canh_bao|cong_thuc_phieu|vi_tri|noi_bo|muc_do|.*_ghi_chu|.*_do_tin)$/;
function sachChuoi(s) {
  const bo = String(s).replace(/\s*\([^()]*\)/g, m => NOI_BO.test(m) ? '' : m);
  return bo.split(/(?<=[.;!?])\s+/).filter(c => !NOI_BO.test(c)).join(' ').trim();
}
function sachNoiBo(x) {
  if (typeof x === 'string') return sachChuoi(x);
  if (Array.isArray(x)) return x.map(sachNoiBo).filter(v => v !== '' && v != null);
  if (x && typeof x === 'object') { const o = {}; for (const [k, v] of Object.entries(x)) { if (KHOA_NOI_BO.test(k)) continue; const s = sachNoiBo(v); if (s !== '') o[k] = s; } return o; }
  return x;
}

// Giỏ hàng các dự án khác (màn "Chọn dự án"): sale KHÔNG nhận cột nội bộ (Naked/hoa hồng/map giỏ); khách không nhận gì
function duAnChoSale(da) {
  if (!da || !Array.isArray(da.du_an)) return da;
  return { ...da, du_an: da.du_an.map(p => ({ ...p, bang: (p.bang || []).map(b => ({ ...b, cot: b.cot.filter(c => !(p.cot_noi_bo || []).includes(c)), dong: b.dong.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !(p.cot_noi_bo || []).includes(k)))) })) })) };
}
function duLieuTheoVai(vai) {
  const d = DU_LIEU || {};
  if (vai === 'admin') return d;
  if (vai === 'sales') return { ...d, UNITS: (d.UNITS || []).map(({ gia_hh, ...u }) => u), DU_AN: duAnChoSale(d.DU_AN) };   // giá tính hoa hồng / cột nội bộ: chỉ admin
  return sachNoiBo(catChoKhach(d));
}
function catChoKhach(d) {
  const meta = { ...(d.META || {}) };
  delete meta.thu_muc_drive;
  meta.the_tong_quan = (meta.the_tong_quan || []).filter(t => !t.noi_bo).map(({ nguon, ...t }) => ({ ...t, html: String(t.html || '').replace(/<li data-het="[^"]*">[\s\S]*?<\/li>/g, '') }));
  if (meta.phap_ly_ngan_khach) meta.phap_ly_ngan = meta.phap_ly_ngan_khach;
  delete meta.phap_ly_ngan_khach;
  // công văn: bỏ câu ghi chú nội bộ (tên file Drive, bản chép OCR…), GIỮ nguyên lời văn bản — kể cả dòng cấm người nước ngoài của CV 8789
  meta.cong_van = (meta.cong_van || []).map(c => ({ ...c, noi_dung: String(c.noi_dung || '').split(/(?<=\.)\s+/).filter(x => !/tên file|bản chép|ghép lại|drive/i.test(x)).join(' ') }));
  const mb = {};
  for (const [ma, t] of Object.entries(d.MB || {})) {
    mb[ma] = { mat_bang_loai: (t.mat_bang_loai || []).map(l => ({ ten: l.ten, tang_ap_dung: l.tang_ap_dung,
      can: (l.can || []).map(c => ({ ma: c.ma, loai: c.loai, loai_do_tin: c.loai_do_tin, thong_thuy: c.thong_thuy, tim_tuong: c.tim_tuong, chac_chan: c.chac_chan })) })) };
  }
  return {
    META: meta,
    KB: [],
    // Bảng hàng cho khách: số liệu căn + giá tổng/tiến độ/vay + ảnh chỉ căn. KHÔNG: giá hoa hồng, giá TT nhanh 95%
    // (tạm dừng tư vấn), phiếu tính giá CĐT (văn bản nội bộ), thẻ FBG (có giá 95%), cảnh báo nội bộ.
    UNITS: (d.UNITS || []).map(u => ({ ma: u.ma, toa: u.toa, tang: u.tang, dt: u.dt, loai: u.loai, gia_tong: u.gia_tong, gia_tien_do: u.gia_tien_do, gia_vay: u.gia_vay, chi_can: u.chi_can })),
    MB: mb,
    TOA: (d.TOA || []).map(({ ghi_chu, nguon, ma_phap_ly_do_tin, cong_van_du_dk_ban, ...t }) => ({ ...t, ma_phap_ly: null,
      // Square District (CS3): CV 8789/SXD-QLN 26/5/2026 cấm NNN sở hữu → không chào, không nhận hồ sơ; câu KHÔNG được ngầm hứa đường cọc
      nguoi_nuoc_ngoai: !t.nguoi_nuoc_ngoai ? t.nguoi_nuoc_ngoai : t.phan_khu === 'Square District'
        ? 'Hiện chưa nhận hồ sơ người nước ngoài cho các tòa khu Square District, đang chờ xác nhận bằng văn bản của chủ đầu tư hoặc Sở Xây dựng.'
        : 'Đang chờ xác nhận bằng văn bản của chủ đầu tư. Khách nước ngoài vui lòng hỏi chuyên viên trước khi đặt cọc.' })),
    CS: (d.CS || []).filter(c => c.trang_thai !== 'het-hieu-luc').map(({ luu_y, nguon, cong_thuc_phieu, trang_thai_ghi_chu, ...c }) => ({
      ...c,
      // phương án luật sư đề nghị tạm dừng tư vấn (95%) → không đưa cho khách; ưu đãi ngoài CSBH (Early Birds, nguồn nhóm chat) → không đưa cho khách
      phuong_an: (c.phuong_an || []).filter(p => !(p.ghi_chu || []).some(g => /Tạm dừng tư vấn/.test(g))).map(({ ghi_chu, ...p }) => p),
      uu_dai_them: [],
    })),
  };
}

// ===== HOẠT ĐỘNG + BÁO CÁO HIỆU SUẤT (tab Báo cáo, chỉ vai admin) =====
// Trang gom sự kiện theo lô → POST /api/act {tk, ev:[{e,d}]}. Mỗi lô = 1 lượt đọc + 1 lượt ghi KV
// (hạn mức free 1.000 ghi/ngày — ĐỪNG ghi từng sự kiện). Gộp vào hd_<ngày VN>_<sđt>, TTL 120 ngày.
const TRAN_GHI = 20;
const SU_KIEN = new Set(['vao', 'tab', 'toa', 'hoi', 'lich', 'cs', 'kb', 'ts', 'hen', 'dl', 'can', 'kho']);
async function ghiHoatDong(env, tk, ev, vuotTran = false) {
  const k = 'hd_' + ngayVN() + '_' + tk.p;
  const cu = await env.CSQ.get(k);
  const h = cu ? JSON.parse(cu) : { p: tk.p, n: {}, tab: {}, toa: {}, hoi: [], dau: gioVN() };
  // Trần ghi: tối đa 20 lô/người/ngày → 20 sale × 20 = 400 ghi, chừa chỗ cho đăng ký/đăng nhập trong hạn mức 1.000.
  // Quá trần thì BỎ lô (báo cáo thiếu một ít) — tuyệt đối không để đăng nhập của cả đội chết vì hết hạn mức.
  if ((h.w || 0) >= TRAN_GHI && !vuotTran) { return false; }   // hẹn (chủ động, ít) được ghi vượt trần
  h.w = (h.w || 0) + 1;
  for (const x of ev.slice(0, 200)) {
    if (!x || !SU_KIEN.has(x.e)) continue;
    h.n[x.e] = (h.n[x.e] || 0) + 1;
    const d = String(x.d ?? '').slice(0, 160);
    if (x.e === 'tab' && d) h.tab[d] = (h.tab[d] || 0) + 1;
    if (x.e === 'toa' && d) h.toa[d] = (h.toa[d] || 0) + 1;
    if (x.e === 'can' && d) { h.can = h.can || {}; h.can[d] = (h.can[d] || 0) + 1; }
    if (x.e === 'hen' && d !== 'kho') h.hen_nut = (h.hen_nut || 0) + 1;   // nút "chốt được hẹn" (tự khai) — tách khỏi hẹn đếm từ kho
    if (x.e === 'hoi' && d) { h.hoi.push({ q: d, id: x.id ? String(x.id).slice(0, 60) : null }); if (h.hoi.length > 60) h.hoi.shift(); }
  }
  h.cuoi = gioVN(); h.s = tk.s; h.vai = tk.vai;
  await env.CSQ.put(k, JSON.stringify(h), { expirationTtl: 120 * 86400 });
  return true;
}
async function baoCao(env, soNgay) {
  const tks = [];
  let cur;
  do { const r = await env.CSQ.list({ prefix: 'tk_', cursor: cur }); for (const k of r.keys) { const v = await env.CSQ.get(k.name); if (v) tks.push(JSON.parse(v)); } cur = r.list_complete ? null : r.cursor; } while (cur);
  const ngay = [];
  for (let i = soNgay - 1; i >= 0; i--) {
    const nd = ngayVN(i), ds = [];
    let c2;
    do { const r = await env.CSQ.list({ prefix: 'hd_' + nd + '_', cursor: c2 }); for (const k of r.keys) { const v = await env.CSQ.get(k.name); if (v) ds.push(JSON.parse(v)); } c2 = r.list_complete ? null : r.cursor; } while (c2);
    ngay.push({ ngay: nd, ds });
  }
  // Gộp theo người
  const nguoi = {};
  for (const t of tks) nguoi[t.p] = { p: t.p, s: t.s, vai: t.vai, tt: t.tt, tao: t.tao, thiet_bi: (t.tks || []).length, ngay_hd: 0, n: {}, tab: {}, toa: {}, hoi: 0, hoi_truot: 0, cuoi: null };
  const truot = [], hoiDem = {};
  for (const { ngay: nd, ds } of ngay) for (const h of ds) {
    const u = nguoi[h.p] || (nguoi[h.p] = { p: h.p, s: h.s, vai: h.vai, tt: 'da-xoa', ngay_hd: 0, n: {}, tab: {}, toa: {}, hoi: 0, hoi_truot: 0, cuoi: null });
    u.ngay_hd++;
    for (const [k, v] of Object.entries(h.n || {})) u.n[k] = (u.n[k] || 0) + v;
    for (const [k, v] of Object.entries(h.tab || {})) u.tab[k] = (u.tab[k] || 0) + v;
    for (const [k, v] of Object.entries(h.toa || {})) u.toa[k] = (u.toa[k] || 0) + v;
    for (const q of h.hoi || []) {
      u.hoi++;
      if (q.id) hoiDem[q.id] = (hoiDem[q.id] || 0) + 1;
      else { u.hoi_truot++; truot.push({ ngay: nd, s: h.s, q: q.q }); }
    }
    if (!u.cuoi || String(h.cuoi) > u.cuoi) u.cuoi = h.cuoi;
  }
  const datLich = [];
  for (let i = soNgay - 1; i >= 0; i--) {
    let c3;
    do { const r = await env.CSQ.list({ prefix: 'lh_' + ngayVN(i) + '_', cursor: c3 }); for (const k of r.keys) { const v = await env.CSQ.get(k.name); if (v) datLich.push(JSON.parse(v)); } c3 = r.list_complete ? null : r.cursor; } while (c3);
  }
  return {
    ok: true, luc: gioVN(), so_ngay: soNgay,
    dat_lich: datLich.sort((a, b) => String(b.luc).localeCompare(String(a.luc))),
    tai_khoan: { tong: tks.length, cho: tks.filter(t => t.tt === 'cho').length, sales: tks.filter(t => t.tt === 'duyet' && t.vai === 'sales').length, khach: tks.filter(t => t.tt === 'duyet' && t.vai === 'khach').length, admin: tks.filter(t => t.vai === 'admin').length, tuchoi: tks.filter(t => t.tt === 'tuchoi').length },
    theo_ngay: ngay.map(({ ngay: nd, ds: tat }) => ({ ds: tat.filter(h => h.vai !== 'admin'), nd })).map(({ nd, ds }) => ({ ngay: nd, nguoi: ds.length, sales: ds.filter(h => h.vai === 'sales').length, khach: ds.filter(h => h.vai === 'khach').length, tuong_tac: ds.reduce((a, h) => a + Object.values(h.n || {}).reduce((x, y) => x + y, 0), 0) })),
    nguoi: Object.values(nguoi),
    cho_duyet: tks.filter(t => t.tt === 'cho').map(t => ({ p: t.p, s: t.s, e: t.e, vai: t.vai, tao: t.tao })),
    hoi_truot: truot.slice(-40).reverse(),
    hoi_nhieu: Object.entries(hoiDem).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ id, n })),
  };
}

// ===== KHO KHÁCH (D1 `DB`, bảng khach + lich_su — d1/schema.sql) =====
// Admin nạp file → chia cho sale; sale chỉ thấy/sửa khách có sale_p = SĐT mình. KHÔNG có đường nào để vai khách đọc kho.
const TT_KHACH = { moi: 'Mới', 'da-goi': 'Đã gọi', 'khong-nghe': 'Không nghe máy', 'quan-tam': 'Quan tâm', 'hen-xem': 'Hẹn xem', 'da-xem': 'Đã xem', lock: 'Lock căn', coc: 'Đã cọc', 'khong-nhu-cau': 'Không nhu cầu', dnc: 'Không gọi nữa (DNC)' };
const TT_BAO = ['hen-xem', 'lock', 'coc'];   // báo Telegram CEO
async function saleDaDuyet(env) {
  const ds = []; let cur;
  do { const r = await env.CSQ.list({ prefix: 'tk_', cursor: cur }); for (const k of r.keys) { const v = await env.CSQ.get(k.name); if (v) { const t = JSON.parse(v); if (t.tt === 'duyet' && t.vai === 'sales') ds.push({ p: t.p, s: t.s }); } } cur = r.list_complete ? null : r.cursor; } while (cur);
  return ds;
}
async function chiaDeu(env, ids) {
  // chia đều: ưu tiên sale đang giữ ÍT khách nhất (tính cả khách cũ)
  const sales = await saleDaDuyet(env);
  if (!sales.length || !ids.length) return 0;
  const dem = Object.fromEntries(sales.map(x => [x.p, 0]));
  const { results } = await env.DB.prepare('SELECT sale_p, COUNT(*) n FROM khach WHERE sale_p IS NOT NULL GROUP BY sale_p').all();
  for (const r of results) if (r.sale_p in dem) dem[r.sale_p] = r.n;
  const luc = gioVN(), lenh = [];
  for (const id of ids) {
    const p = Object.entries(dem).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0][0];
    dem[p]++;
    lenh.push(env.DB.prepare('UPDATE khach SET sale_p=?, sua=? WHERE id=?').bind(p, luc, id));
    lenh.push(env.DB.prepare('INSERT INTO lich_su (khach_id, sale_p, loai, noi_dung, luc) VALUES (?,?,?,?,?)').bind(id, p, 'giao', 'chia đều', luc));
  }
  for (let i = 0; i < lenh.length; i += 90) await env.DB.batch(lenh.slice(i, i + 90));
  return ids.length;
}
async function khoNap(env, b) {
  const ds = Array.isArray(b.ds) ? b.ds.slice(0, 1000) : [];
  const luc = gioVN(), lo = 'lo-' + Date.now().toString(36), nguonChung = sach(b.nguon, 60) || 'Nạp tay';
  let loi = 0, trungFile = 0; const gap = new Set(), hop = [];
  for (const r of ds) {
    const p = chuanSdt(r.sdt);
    if (!p) { loi++; continue; }
    if (gap.has(p)) { trungFile++; continue; }
    gap.add(p);
    hop.push({ p, ten: sach(r.ten, 60) || null, nguon: sach(r.nguon, 60) || nguonChung, nhu_cau: sach(r.nhu_cau, 160) || null, ghi: sach(r.ghi_chu, 300) || null });
  }
  let giaoCho = null;
  if (typeof b.chia === 'string' && b.chia.startsWith('sale:')) {
    const p = chuanSdt(b.chia.slice(5)); const tk = p && await docTK(env, p);
    if (!tk || tk.tt !== 'duyet' || tk.vai !== 'sales') return json({ ok: false, err: 'sale' }, 400);
    giaoCho = p;
  }
  const lenh = hop.map(k => env.DB.prepare('INSERT OR IGNORE INTO khach (sdt, ten, nguon, nhu_cau, ghi_chu_goc, sale_p, lo_nap, tao, sua) VALUES (?,?,?,?,?,?,?,?,?)').bind(k.p, k.ten, k.nguon, k.nhu_cau, k.ghi, giaoCho, lo, luc, luc));
  let them = 0;
  for (let i = 0; i < lenh.length; i += 90) { const kq = await env.DB.batch(lenh.slice(i, i + 90)); them += kq.reduce((a, x) => a + (x.meta && x.meta.changes || 0), 0); }
  let chia = 0;
  if (b.chia === 'deu') { const { results } = await env.DB.prepare('SELECT id FROM khach WHERE lo_nap=? AND sale_p IS NULL').bind(lo).all(); chia = await chiaDeu(env, results.map(r => r.id)); }
  if (giaoCho) chia = them;
  return json({ ok: true, lo, nhan: ds.length, hop_le: hop.length, them, trung_kho: hop.length - them, trung_file: trungFile, loi, chia, giao_cho: giaoCho });
}
function hangKhach(r, laAdmin) {
  const o = { id: r.id, ten: r.ten, sdt: r.sdt, nguon: r.nguon, nhu_cau: r.nhu_cau, ghi_chu_goc: r.ghi_chu_goc, trang_thai: r.trang_thai, ghi_chu: r.ghi_chu, hen_lai: r.hen_lai, lan_cham: r.lan_cham, cham_cuoi: r.cham_cuoi, tao: r.tao };
  if (laAdmin) o.sale_p = r.sale_p;
  return o;
}

// ===== THI ĐUA — điểm tính từ THAO TÁC THẬT (D1 lich_su + nút hẹn trong KV hd_), không tự khai điểm =====
// Chống gian lận: mỗi (khách, mốc) chỉ tính 1 lần TRONG CẢ LỊCH SỬ (lần đầu đạt mốc phải rơi vào kỳ);
// "chăm" = số khách KHÁC NHAU có thao tác mỗi ngày, trần N khách/ngày.
function dauKy(ky) {
  const hn = ngayVN();
  if (ky === 'tuan') { const d = new Date(hn + 'T00:00:00Z'); const th = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - th); return d.toISOString().slice(0, 10); }
  if (ky === 'thang') return hn.slice(0, 8) + '01';
  return ngayVN(29);   // 30 ngày
}
async function thiDua(env, ky, toi) {
  const cfg = ((DU_LIEU || {}).META || {}).thi_dua || { diem: {}, tran_cham_ngay: 30 };
  const D = cfg.diem, tu = dauKy(ky), den = ngayVN();
  const MA = Object.fromEntries(Object.entries(TT_KHACH).map(([k, v]) => [v, k]));   // lich_su lưu NHÃN trạng thái
  const sales = await saleDaDuyet(env);
  const bang = Object.fromEntries(sales.map(x => [x.p, { ten: x.s, toi: x.p === toi, diem: 0, ct: {}, ngay: new Set() }]));
  const cong = (p, loai, n = 1) => { const b = bang[p]; if (!b || !n) return; b.ct[loai] = (b.ct[loai] || 0) + n; b.diem += (D[loai] || 0) * n; };
  if (env.DB) {
    // mốc trạng thái: lần ĐẦU mỗi khách đạt mốc (toàn lịch sử), tính cho sale thao tác lần đó
    const { results: moc } = await env.DB.prepare("SELECT khach_id, noi_dung, MIN(luc) luc, sale_p FROM lich_su WHERE loai='trang-thai' GROUP BY khach_id, noi_dung").all();
    for (const r of moc) { const ma = MA[r.noi_dung]; const ngay = String(r.luc).slice(0, 10); if (ma in D && ngay >= tu && ngay <= den) cong(r.sale_p, ma); }
    // chăm: khách khác nhau mỗi ngày, có trần
    const { results: cham } = await env.DB.prepare("SELECT sale_p, substr(luc,1,10) ngay, COUNT(DISTINCT khach_id) n FROM lich_su WHERE loai IN ('trang-thai','ghi-chu','hen-lai') AND substr(luc,1,10) BETWEEN ? AND ? GROUP BY sale_p, ngay").bind(tu, den).all();
    for (const r of cham) { cong(r.sale_p, 'cham', Math.min(r.n, cfg.tran_cham_ngay || 30)); if (bang[r.sale_p]) bang[r.sale_p].ngay.add(r.ngay); }
  }
  // nút "chốt được hẹn" (KV hd_<ngày>_<sđt>.hen_nut)
  for (let i = 0; ; i++) {
    const nd = ngayVN(i); if (nd < tu) break;
    for (const x of sales) { const v = await env.CSQ.get('hd_' + nd + '_' + x.p); if (v) { const h = JSON.parse(v); cong(x.p, 'hen-nut', h.hen_nut || 0); } }
    if (i > 31) break;
  }
  // chuỗi ngày chăm liên tục tính tới hôm nay (hoặc hôm qua)
  const chuoi = b => { let n = 0; for (let i = 0; i < 60; i++) { const nd = ngayVN(i); if (b.ngay.has(nd)) n++; else if (i > 0) break; } return n; };
  const ds = Object.values(bang).map(b => ({ ten: b.ten, toi: b.toi, diem: b.diem, ct: b.ct, chuoi: chuoi(b) })).sort((a, b) => b.diem - a.diem || a.ten.localeCompare(b.ten));
  let hang = 0, truoc = null; ds.forEach((x, i) => { if (x.diem !== truoc) { hang = i + 1; truoc = x.diem; } x.hang = hang; });
  return { ok: true, ky, tu, den, ds, cach_tinh: cfg };
}

async function dangKy(env, req, origin) {
  let b; try { b = await req.json(); } catch (_) { return json({ ok: false, err: 'json' }, 400); }
  const p = chuanSdt(b.p);
  if (!p) return json({ ok: false, err: 'sdt' }, 400);
  let tk = await docTK(env, p);
  if (tk && tk.tt === 'tuchoi') return json({ ok: false, err: 'tuchoi' }, 403);
  if (tk && tk.tt === 'duyet') {
    // BẢO MẬT (26/09): SĐT sale/CEO công khai trên mạng → biết SĐT KHÔNG được vào thẳng nữa.
    // Máy mới nhận token ở trạng thái CHỜ, CEO bấm "Cho phép" trên Telegram mới dùng được. Không đổi vai, không sửa tên/email.
    const han = Date.now() - TTL_DUYET * 1000;
    tk.cho_tb = (tk.cho_tb || []).filter(x => x.luc > han);
    if (tk.cho_tb.length >= TRAN_CHO_TB) return json({ ok: false, err: 'nhieu-tb' }, 429);
    const t = rand(), dy = rand();
    tk.cho_tb.push({ t, luc: Date.now() });
    await env.CSQ.put('ss_' + t, p, { expirationTtl: TTL_PHIEN });
    await env.CSQ.put('dtb_' + dy, JSON.stringify({ p, t }), { expirationTtl: TTL_DUYET });
    await ghiTK(env, tk);
    await baoTelegram(env, ['📱 THIẾT BỊ MỚI xin vào — ' + SITE, `${tk.s} · ${p} · ${TEN_VAI_DAY[tk.vai]}`, gioVN(), 'Không phải người này đang đăng nhập thì bấm Từ chối.', '', 'Cho phép: ' + origin + '/duyet-tb?t=' + dy]);
    return json({ ok: true, tt: 'cho', vai: tk.vai, tk: t, s: tk.s, may_moi: true });
  }
  const s = sach(b.s, 60), e = sach(b.e, 100), vai = b.vai;
  if (s.length < 2) return json({ ok: false, err: 'ten' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ ok: false, err: 'email' }, 400);
  if (!TEN_VAI[vai]) return json({ ok: false, err: 'vai' }, 400);
  const moi = !tk;
  if (moi) {
    const kd = 'dk_' + ngayVN();
    const dem = parseInt(await env.CSQ.get(kd) || '0', 10);
    if (dem >= TRAN_DK_NGAY) return json({ ok: false, err: 'qua-tai' }, 429);
    await env.CSQ.put(kd, String(dem + 1), { expirationTtl: 3 * 86400 });
    if (dem + 1 === TRAN_DK_NGAY) await baoTelegram(env, ['⚠️ ' + SITE + ': chạm trần ' + TRAN_DK_NGAY + ' đăng ký mới hôm nay — đăng ký mới tạm dừng tới 0h. Nếu là spam, không cần làm gì.']);
  }
  tk = tk || { p, tao: gioVN(), tks: [] };
  Object.assign(tk, { s, e, vai, tt: 'cho' });
  const t = await capPhien(env, tk);
  if (moi || !tk.dy_luc || Date.now() - tk.dy_luc > 3600e3) {
    // Link duyệt mới (tối đa 1 lần/giờ/tài khoản để không spam Telegram khi người dùng bấm lại)
    const dy = rand();
    await env.CSQ.put('dy_' + dy, p, { expirationTtl: TTL_DUYET });
    tk.dy_luc = Date.now(); await ghiTK(env, tk);
    await baoTelegram(env, ['🆕 XIN VÀO HUB — ' + SITE, `${tk.s} · ${p}`, `Xin vai: ${TEN_VAI[vai]}`, gioVN(), '', 'Duyệt: ' + origin + '/duyet?t=' + dy]);
  }
  return json({ ok: true, tt: 'cho', vai, tk: t, s: tk.s });
}

async function trangDuyet(env, req, url) {
  const form = req.method === 'POST' ? await req.formData().catch(() => null) : null;
  const t = (form ? form.get('t') : url.searchParams.get('t')) || '';
  const p = /^[a-f0-9]{48}$/.test(t) ? await env.CSQ.get('dy_' + t) : null;
  const tk = p ? await docTK(env, p) : null;
  if (!tk) return html('<h2>Link duyệt không còn hiệu lực</h2><p class="m">Link đã dùng, hết hạn 7 ngày, hoặc sai. Duyệt lại ở trang quản trị.</p>', 410);
  if (req.method === 'GET') {
    // GET chỉ HIỆN trang xác nhận — bot xem trước link của Telegram không được duyệt hộ
    return html(`<h2>Duyệt tài khoản hub Capital Square</h2><p><b>${esc(tk.s)}</b> · ${esc(tk.p)}<br>Email: ${esc(tk.e)}<br>Xin vai: <b>${esc(TEN_VAI[tk.vai])}</b><br><span class="m">Đăng ký lúc ${esc(tk.tao)} · trạng thái hiện tại: ${esc(tk.tt)}</span></p>
      <form method="post"><input type="hidden" name="t" value="${esc(t)}">
      <button name="kq" value="sales">Duyệt vai SALE</button><button class="alt" name="kq" value="khach">Duyệt vai KHÁCH</button><button class="no" name="kq" value="tuchoi">Từ chối</button></form>`);
  }
  const kq = form && form.get('kq');
  if (!['sales', 'khach', 'tuchoi'].includes(kq)) return html('<p>Thiếu lựa chọn.</p>', 400);
  await env.CSQ.delete('dy_' + t);
  if (kq === 'tuchoi') { tk.tt = 'tuchoi'; for (const x of tk.tks || []) await env.CSQ.delete('ss_' + x); tk.tks = []; }
  else { tk.tt = 'duyet'; tk.vai = kq; }
  await ghiTK(env, tk);
  return html(`<h2>${kq === 'tuchoi' ? 'Đã từ chối' : 'Đã duyệt vai ' + esc(TEN_VAI[kq])}</h2><p>${esc(tk.s)} · ${esc(tk.p)}</p><p class="m">Người dùng bấm "Kiểm tra lại" trên hub là vào được.</p>`);
}

async function trangDuyetTB(env, req, url) {
  const form = req.method === 'POST' ? await req.formData().catch(() => null) : null;
  const dy = (form ? form.get('t') : url.searchParams.get('t')) || '';
  const v = /^[a-f0-9]{48}$/.test(dy) ? await env.CSQ.get('dtb_' + dy) : null;
  const { p, t } = v ? JSON.parse(v) : {};
  const tk = p ? await docTK(env, p) : null;
  const dang = tk && (tk.cho_tb || []).find(x => x.t === t);
  if (!tk || !dang) return html('<h2>Link không còn hiệu lực</h2><p class="m">Đã dùng, hết hạn 7 ngày, hoặc thiết bị đã bị huỷ.</p>', 410);
  if (req.method === 'GET') {
    return html(`<h2>Cho phép thiết bị mới?</h2><p><b>${esc(tk.s)}</b> · ${esc(tk.p)} · vai <b>${esc(TEN_VAI_DAY[tk.vai])}</b><br><span class="m">Yêu cầu lúc ${esc(new Date(dang.luc + 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 16))}. Chỉ cho phép khi chắc chắn chính người này đang đăng nhập.</span></p>
      <form method="post"><input type="hidden" name="t" value="${esc(dy)}"><button name="kq" value="cho">Cho phép</button><button class="no" name="kq" value="tuchoi">Từ chối thiết bị này</button></form>`);
  }
  const kq = form && form.get('kq');
  if (!['cho', 'tuchoi'].includes(kq)) return html('<p>Thiếu lựa chọn.</p>', 400);
  await env.CSQ.delete('dtb_' + dy);
  tk.cho_tb = (tk.cho_tb || []).filter(x => x.t !== t);
  if (kq === 'cho') {
    tk.tks = [...(tk.tks || []), t];
    while (tk.tks.length > MAX_THIET_BI) { const cu = tk.tks.shift(); await env.CSQ.delete('ss_' + cu); }
  } else await env.CSQ.delete('ss_' + t);
  await ghiTK(env, tk);
  return html(`<h2>${kq === 'cho' ? 'Đã cho phép thiết bị' : 'Đã từ chối thiết bị'}</h2><p>${esc(tk.s)} · ${esc(tk.p)}</p><p class="m">${kq === 'cho' ? 'Người dùng bấm "Kiểm tra lại" trên hub là vào được.' : 'Thiết bị đó không vào được. Tài khoản và các máy đã cho phép vẫn giữ nguyên.'}</p>`);
}

// /quan-tri: khoá KHÔNG nằm trên URL nữa (lịch sử trình duyệt/đồng bộ/log). Nhập khoá 1 lần → cookie HttpOnly 12 giờ.
async function bamKhoa(k) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('csq-qt|' + k)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function bangNhau(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function quanTri(env, req, url) {
  if (!env.ADMIN_KEY) return html('<h2>Không có quyền</h2>', 403);
  const dung = await bamKhoa(env.ADMIN_KEY);
  const ck = ((req.headers.get('cookie') || '').match(/(?:^|;\s*)csq_qt=([a-f0-9]{64})/) || [])[1] || '';
  if (!bangNhau(ck, dung)) {
    if (req.method === 'POST') {
      const f = await req.formData().catch(() => null);
      const k = f && String(f.get('khoa') || '');
      if (k && bangNhau(await bamKhoa(k), dung)) return new Response(null, { status: 303, headers: { location: '/quan-tri', 'set-cookie': `csq_qt=${dung}; Path=/quan-tri; Max-Age=43200; HttpOnly; Secure; SameSite=Strict`, 'cache-control': 'no-store' } });
    }
    return html(`<h2>Quản trị hub Capital Square</h2><form method="post"><input type="password" name="khoa" placeholder="Khoá quản trị" autocomplete="current-password" style="font:inherit;padding:10px;width:100%;box-sizing:border-box;margin:8px 0"><button>Vào</button></form><p class="m">Khoá nằm trong ~/.config/capital-square/admin.env trên máy CEO.</p>`, req.method === 'POST' ? 403 : 200);
  }
  return quanTriDaVao(env, req, url);
}
async function quanTriDaVao(env, req, url) {
  if (req.method === 'POST') {
    const f = await req.formData();
    const p = chuanSdt(f.get('p')), kq = f.get('kq');
    const tk = p ? await docTK(env, p) : null;
    if (tk && ['sales', 'khach', 'admin', 'tuchoi', 'xoa'].includes(kq)) {
      if (kq === 'xoa') { for (const x of tk.tks || []) await env.CSQ.delete('ss_' + x); await env.CSQ.delete('tk_' + p); }
      else if (kq === 'tuchoi') { tk.tt = 'tuchoi'; for (const x of tk.tks || []) await env.CSQ.delete('ss_' + x); tk.tks = []; await ghiTK(env, tk); }
      else { tk.tt = 'duyet'; tk.vai = kq; await ghiTK(env, tk); }
    }
    return new Response(null, { status: 303, headers: { location: '/quan-tri', 'cache-control': 'no-store' } });
  }
  const ds = [];
  let cur;
  do {
    const r = await env.CSQ.list({ prefix: 'tk_', cursor: cur });
    for (const k of r.keys) { const v = await env.CSQ.get(k.name); if (v) ds.push(JSON.parse(v)); }
    cur = r.list_complete ? null : r.cursor;
  } while (cur);
  const thu = { cho: 0, duyet: 1, tuchoi: 2 };
  ds.sort((a, b) => (thu[a.tt] - thu[b.tt]) || String(b.tao).localeCompare(String(a.tao)));
  const nut = p => `<form method="post" style="display:inline"><input type="hidden" name="p" value="${esc(p)}">` +
    `<button name="kq" value="sales">Sale</button><button class="alt" name="kq" value="khach">Khách</button><button name="kq" value="admin" style="background:#2e7d4f">Quản trị</button><button class="no" name="kq" value="tuchoi">Từ chối</button></form>`;
  return html(`<h2>Quản trị hub Capital Square</h2><p class="m">${ds.length} tài khoản · ${ds.filter(x => x.tt === 'cho').length} chờ duyệt. Telegram: ${env.TELEGRAM_BOT_TOKEN ? 'đã nối' : '<b>chưa nối</b> — duyệt tại đây'}.</p>
    <table><tr><th>Tên · SĐT</th><th>Vai</th><th>Trạng thái</th><th>Thiết bị</th><th></th></tr>${ds.map(x => `<tr><td>${esc(x.s)}<br><span class="m">${esc(x.p)} · ${esc(x.e)}</span></td><td>${esc(TEN_VAI_DAY[x.vai] || x.vai)}</td><td>${esc(x.tt)}</td><td>${(x.tks || []).length}</td><td>${nut(x.p)}</td></tr>`).join('')}</table>`);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path === '/api/dang-ky' && req.method === 'POST') return await dangKy(env, req, url.origin);
      if (path === '/api/phien' && req.method === 'POST') {
        const tk = await phienTu(env, req);
        if (!tk) return json({ ok: false, err: 'phien' }, 401);
        return json({ ok: true, tt: tk.tt, vai: tk.vai, s: tk.s });
      }
      if (path === '/api/du-lieu') {
        const tk = await phienTu(env, req);
        if (!tk) return json({ ok: false, err: 'phien' }, 401);
        if (tk.tt !== 'duyet') return json({ ok: false, err: tk.tt }, 403);
        return json({ ok: true, vai: tk.vai, s: tk.s, du_lieu: duLieuTheoVai(tk.vai) });
      }
      if (path === '/api/act' && req.method === 'POST') {
        // sendBeacon không gửi được header → token nằm trong thân
        let b; try { b = await req.json(); } catch (_) { return json({ ok: false }, 400); }
        const t = String(b.tk || '');
        const p = /^[a-f0-9]{48}$/.test(t) ? await env.CSQ.get('ss_' + t) : null;
        const tk = p ? await docTK(env, p) : null;
        if (!tk || tk.tt !== 'duyet' || !(tk.tks || []).includes(t)) return json({ ok: false }, 401);
        if (Array.isArray(b.ev) && b.ev.length) await ghiHoatDong(env, tk, b.ev);
        return json({ ok: true });
      }
      if (path === '/api/hen' && req.method === 'POST') {
        // Sale bấm "Tôi vừa chốt được hẹn" → đếm hẹn thật (chỉ số hoạt động) + báo CEO. KHÔNG thu SĐT khách.
        const tk = await phienTu(env, req);
        if (!tk || tk.tt !== 'duyet' || !['sales', 'admin'].includes(tk.vai)) return json({ ok: false, err: 'quyen' }, 403);
        let b; try { b = await req.json(); } catch (_) { return json({ ok: false }, 400); }
        const ten = sach(b.ten, 40), gio = sach(b.gio, 40), ht = b.ht === 'video' ? 'video' : 'nha-mau';
        if (ten.length < 2 || gio.length < 2) return json({ ok: false, err: 'thieu' }, 400);
        const ghi = await ghiHoatDong(env, tk, [{ e: 'hen', d: ht }], true);
        await baoTelegram(env, ['📅 HẸN MỚI — ' + SITE, `Sale: ${tk.s}`, `Khách: ${ten}`, `Lúc: ${gio}`, ht === 'video' ? 'Hình thức: gọi video' : 'Hình thức: xem nhà mẫu']);
        return json({ ok: true, ghi });
      }
      if (path === '/api/dat-lich' && req.method === 'POST') {
        // KHÁCH đặt lịch xem nhà mẫu / gọi video. Checklist web mới: LƯU TRƯỚC (KV lh_) → rồi mới báo Telegram.
        const tk = await phienTu(env, req);
        if (!tk || tk.tt !== 'duyet' || tk.vai !== 'khach') return json({ ok: false, err: 'quyen' }, 403);
        let b; try { b = await req.json(); } catch (_) { return json({ ok: false }, 400); }
        const homNay = ngayVN(), toiDa = ngayVN(-60);
        const ht = b.ht === 'video' ? 'video' : 'nha-mau';
        const buoi = ['sang', 'chieu', 'toi'].includes(b.buoi) ? b.buoi : null;
        const ngay = /^\d{4}-\d{2}-\d{2}$/.test(b.ngay || '') ? b.ngay : null;
        if (b.dong_y !== true) return json({ ok: false, err: 'dong-y' }, 400);
        if (!ngay || ngay < homNay || ngay > toiDa || !buoi) return json({ ok: false, err: 'ngay' }, 400);
        const kd = 'lhd_' + homNay + '_' + tk.p, dem = parseInt(await env.CSQ.get(kd) || '0', 10);
        if (dem >= 3) return json({ ok: false, err: 'nhieu' }, 429);
        const lich = { p: tk.p, s: tk.s, ht, ngay, buoi, ghi_chu: sach(b.ghi_chu, 160), luc: gioVN(), dong_y: 'lien-he-xac-nhan-lich v1 ' + gioVN() };
        await env.CSQ.put('lh_' + homNay + '_' + Date.now() + rand().slice(0, 6) + '_' + tk.p, JSON.stringify(lich), { expirationTtl: 180 * 86400 });
        await env.CSQ.put(kd, String(dem + 1), { expirationTtl: 2 * 86400 });
        await ghiHoatDong(env, tk, [{ e: 'dl', d: ht }], true);
        if (env.DB) {   // khách tự đặt lịch → vào kho khách (chưa giao), ghi lịch sử
          const nd = `Đặt lịch ${ht === 'video' ? 'gọi video' : 'xem nhà mẫu'} ${ngay} ${buoi}${lich.ghi_chu ? ' · ' + lich.ghi_chu : ''}`;
          await env.DB.prepare('INSERT OR IGNORE INTO khach (sdt, ten, nguon, nhu_cau, trang_thai, tao, sua) VALUES (?,?,?,?,?,?,?)').bind(tk.p, tk.s, 'Hub - khách đặt lịch', lich.ghi_chu || null, 'moi', lich.luc, lich.luc).run();
          const k = await env.DB.prepare('SELECT id FROM khach WHERE sdt=?').bind(tk.p).first();
          if (k) await env.DB.prepare('INSERT INTO lich_su (khach_id, sale_p, loai, noi_dung, luc) VALUES (?,?,?,?,?)').bind(k.id, null, 'dat-lich', nd, lich.luc).run();
        }
        const TEN_BUOI = { sang: 'buổi sáng', chieu: 'buổi chiều', toi: 'buổi tối' };
        await baoTelegram(env, ['🔔 KHÁCH ĐẶT LỊCH — ' + SITE, `Tên: ${tk.s}`, `SĐT: ${tk.p}`, ht === 'video' ? 'Muốn: gọi video xem mặt bằng' : 'Muốn: xem nhà mẫu', `Ngày: ${ngay.split('-').reverse().join('/')} · ${TEN_BUOI[buoi]}`, lich.ghi_chu ? `Ghi chú: ${lich.ghi_chu}` : null, 'Gọi lại xác nhận lịch + mở cửa nhà mẫu.']);
        return json({ ok: true });
      }
      if (path.startsWith('/api/kho') || path === '/api/khach-cua-toi' || path === '/api/khach/cap-nhat') {
        if (!env.DB) return json({ ok: false, err: 'chua-co-kho' }, 503);
        const tk = await phienTu(env, req);
        if (!tk || tk.tt !== 'duyet' || !['sales', 'admin'].includes(tk.vai)) return json({ ok: false, err: 'quyen' }, 403);
        const ad = tk.vai === 'admin';
        if (path === '/api/kho/nap' && req.method === 'POST') {
          if (!ad) return json({ ok: false, err: 'quyen' }, 403);
          let b; try { b = await req.json(); } catch (_) { return json({ ok: false }, 400); }
          return await khoNap(env, b);
        }
        if (path === '/api/kho/giao' && req.method === 'POST') {
          if (!ad) return json({ ok: false, err: 'quyen' }, 403);
          let b; try { b = await req.json(); } catch (_) { return json({ ok: false }, 400); }
          if (b.chia_deu_chua_giao) { const { results } = await env.DB.prepare('SELECT id FROM khach WHERE sale_p IS NULL').all(); return json({ ok: true, chia: await chiaDeu(env, results.map(r => r.id)) }); }
          const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger).slice(0, 500);
          const p = b.sale_p ? chuanSdt(b.sale_p) : null;
          if (p) { const t = await docTK(env, p); if (!t || t.tt !== 'duyet' || t.vai !== 'sales') return json({ ok: false, err: 'sale' }, 400); }
          const luc = gioVN(), lenh = [];
          for (const id of ids) { lenh.push(env.DB.prepare('UPDATE khach SET sale_p=?, sua=? WHERE id=?').bind(p, luc, id)); lenh.push(env.DB.prepare('INSERT INTO lich_su (khach_id, sale_p, loai, noi_dung, luc) VALUES (?,?,?,?,?)').bind(id, p, 'giao', p ? 'giao tay' : 'thu hồi về kho', luc)); }
          for (let i = 0; i < lenh.length; i += 90) await env.DB.batch(lenh.slice(i, i + 90));
          return json({ ok: true, giao: ids.length });
        }
        if (path === '/api/kho') {
          if (!ad) return json({ ok: false, err: 'quyen' }, 403);
          const q = sach(url.searchParams.get('q'), 40), sale = url.searchParams.get('sale') || '', tt = url.searchParams.get('tt') || '';
          const dk = [], ts = [];
          if (sale === 'chua') dk.push('sale_p IS NULL'); else if (sale) { dk.push('sale_p=?'); ts.push(sale); }
          if (tt && TT_KHACH[tt]) { dk.push('trang_thai=?'); ts.push(tt); }
          if (q) { dk.push('(sdt LIKE ? OR ten LIKE ?)'); ts.push('%' + q + '%', '%' + q + '%'); }
          const where = dk.length ? ' WHERE ' + dk.join(' AND ') : '';
          const [ds, tong, theoSale, theoTT] = await Promise.all([
            env.DB.prepare('SELECT * FROM khach' + where + ' ORDER BY sua DESC LIMIT 200').bind(...ts).all(),
            env.DB.prepare('SELECT COUNT(*) n, SUM(sale_p IS NULL) chua, SUM(lan_cham > 0) da_cham FROM khach').first(),
            env.DB.prepare("SELECT sale_p, COUNT(*) n, SUM(lan_cham > 0) da_cham, SUM(trang_thai='hen-xem') hen, SUM(trang_thai IN ('lock','coc')) chot, SUM(hen_lai IS NOT NULL AND hen_lai <= ?) can_goi FROM khach WHERE sale_p IS NOT NULL GROUP BY sale_p").bind(ngayVN()).all(),
            env.DB.prepare('SELECT trang_thai, COUNT(*) n FROM khach GROUP BY trang_thai').all(),
          ]);
          const sales = await saleDaDuyet(env);
          return json({ ok: true, tong, theo_sale: theoSale.results, theo_tt: theoTT.results, sales, ds: ds.results.map(r => hangKhach(r, true)), trang_thai: TT_KHACH });
        }
        if (path === '/api/khach-cua-toi') {
          const { results } = await env.DB.prepare("SELECT * FROM khach WHERE sale_p=? ORDER BY (hen_lai IS NOT NULL AND hen_lai <= ?) DESC, (trang_thai='moi') DESC, sua DESC LIMIT 500").bind(tk.p, ngayVN()).all();
          const id = parseInt(url.searchParams.get('ls') || '0', 10);
          let ls = null;
          if (id && results.some(r => r.id === id)) ls = (await env.DB.prepare('SELECT loai, noi_dung, luc FROM lich_su WHERE khach_id=? ORDER BY id DESC LIMIT 30').bind(id).all()).results;
          return json({ ok: true, hom_nay: ngayVN(), ds: results.map(r => hangKhach(r, false)), trang_thai: TT_KHACH, lich_su: ls });
        }
        if (path === '/api/khach/cap-nhat' && req.method === 'POST') {
          let b; try { b = await req.json(); } catch (_) { return json({ ok: false }, 400); }
          const r = await env.DB.prepare('SELECT * FROM khach WHERE id=?').bind(parseInt(b.id, 10) || 0).first();
          if (!r) return json({ ok: false, err: 'khong-co' }, 404);
          if (!ad && r.sale_p !== tk.p) return json({ ok: false, err: 'khong-phai-khach-cua-ban' }, 403);
          const luc = gioVN(), sua = [], ls = [];
          let tt = r.trang_thai, ghi = r.ghi_chu, hen = r.hen_lai;
          if (b.trang_thai !== undefined) { if (!TT_KHACH[b.trang_thai]) return json({ ok: false, err: 'trang-thai' }, 400); if (b.trang_thai !== tt) { tt = b.trang_thai; ls.push(['trang-thai', TT_KHACH[tt]]); } }
          if (b.ghi_chu !== undefined) { const g = sach(b.ghi_chu, 500); if (g && g !== ghi) { ghi = g; ls.push(['ghi-chu', g]); } }
          if (b.hen_lai !== undefined) { const h = /^\d{4}-\d{2}-\d{2}$/.test(b.hen_lai || '') ? b.hen_lai : null; if (h !== hen) { hen = h; ls.push(['hen-lai', h || 'bỏ hẹn']); } }
          if (tt === 'dnc') hen = null;
          if (!ls.length) return json({ ok: true, khong_doi: true });
          await env.DB.batch([
            env.DB.prepare('UPDATE khach SET trang_thai=?, ghi_chu=?, hen_lai=?, lan_cham=lan_cham+1, cham_cuoi=?, sua=? WHERE id=?').bind(tt, ghi, hen, luc, luc, r.id),
            ...ls.map(([loai, nd]) => env.DB.prepare('INSERT INTO lich_su (khach_id, sale_p, loai, noi_dung, luc) VALUES (?,?,?,?,?)').bind(r.id, tk.p, loai, nd, luc)),
          ]);
          if (tt !== r.trang_thai && TT_BAO.includes(tt)) await baoTelegram(env, [({ 'hen-xem': '📅', lock: '🔒', coc: '💰' })[tt] + ' ' + TT_KHACH[tt].toUpperCase() + ' — ' + SITE, `Sale: ${tk.s}`, `Khách: ${r.ten || '(chưa có tên)'} · …${String(r.sdt).slice(-4)}`, ghi ? `Ghi chú: ${ghi}` : null]);
          if (tt !== r.trang_thai && tt === 'hen-xem') await ghiHoatDong(env, tk, [{ e: 'hen', d: 'kho' }], true);
          return json({ ok: true, trang_thai: tt, hen_lai: hen });
        }
        return json({ ok: false, err: 'khong-co' }, 404);
      }
      if (path === '/api/thi-dua') {
        const tk = await phienTu(env, req);
        if (!tk || tk.tt !== 'duyet' || !['sales', 'admin'].includes(tk.vai)) return json({ ok: false, err: 'quyen' }, 403);
        const ky = ['tuan', 'thang', '30'].includes(url.searchParams.get('ky')) ? url.searchParams.get('ky') : 'tuan';
        return json(await thiDua(env, ky, tk.p));   // chỉ tên + điểm, KHÔNG SĐT sale, KHÔNG dữ liệu khách
      }
      if (path === '/api/bao-cao') {
        const tk = await phienTu(env, req);
        if (!tk || tk.tt !== 'duyet' || tk.vai !== 'admin') return json({ ok: false, err: 'quyen' }, 403);
        const n = Math.min(30, Math.max(1, parseInt(url.searchParams.get('so_ngay') || '7', 10) || 7));
        return json(await baoCao(env, n));
      }
      if (path === '/api/quan-ly' && req.method === 'POST') {
        // Admin duyệt ngay trong tab Báo cáo. KHÔNG cho gán vai admin ở đây (chỉ /quan-tri + ADMIN_KEY)
        const ad = await phienTu(env, req);
        if (!ad || ad.tt !== 'duyet' || ad.vai !== 'admin') return json({ ok: false, err: 'quyen' }, 403);
        let b; try { b = await req.json(); } catch (_) { return json({ ok: false }, 400); }
        const p = chuanSdt(b.p), kq = b.kq;
        const tk = p ? await docTK(env, p) : null;
        if (!tk || !['sales', 'khach', 'tuchoi'].includes(kq)) return json({ ok: false, err: 'dau-vao' }, 400);
        if (tk.vai === 'admin') return json({ ok: false, err: 'khong-sua-admin' }, 400);
        if (kq === 'tuchoi') { tk.tt = 'tuchoi'; for (const x of tk.tks || []) await env.CSQ.delete('ss_' + x); tk.tks = []; }
        else { tk.tt = 'duyet'; tk.vai = kq; }
        await ghiTK(env, tk);
        return json({ ok: true, tt: tk.tt, vai: tk.vai });
      }
      if (path === '/api/dang-xuat' && req.method === 'POST') {
        const t = req.headers.get('x-csq-tk') || '';
        const tk = await phienTu(env, req);
        if (tk) { tk.tks = (tk.tks || []).filter(x => x !== t); tk.cho_tb = (tk.cho_tb || []).filter(x => x.t !== t); await env.CSQ.delete('ss_' + t); await ghiTK(env, tk); }
        return json({ ok: true });
      }
      if (path === '/api/anh') {
        // Ảnh bảng hàng: bắt buộc phiên đã duyệt (trang tải bằng fetch + header rồi tạo blob — token không nằm trên URL)
        const f = url.searchParams.get('f') || '';
        if (!/^(ptg|chi-can|the-fbg)\/[A-Z0-9-]+A?(-(tien-do|vay|tts))?\.jpg$/.test(f)) return json({ ok: false, err: 'f' }, 400);
        const tk = await phienTu(env, req);
        if (!tk || tk.tt !== 'duyet') return json({ ok: false, err: 'phien' }, 401);
        if (tk.vai === 'khach' && !f.startsWith('chi-can/')) return json({ ok: false, err: 'quyen' }, 403);
        const r = await env.ASSETS.fetch(new Request(url.origin + '/anh/' + f));
        if (!r.ok) return json({ ok: false, err: 'khong-co' }, 404);
        return new Response(r.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
      }
      if (path.startsWith('/anh/')) return json({ ok: false, err: 'khong-co' }, 404);   // chặn tải ảnh trực tiếp
      if (path === '/duyet') return await trangDuyet(env, req, url);
      if (path === '/duyet-tb') return await trangDuyetTB(env, req, url);
      if (path === '/quan-tri') return await quanTri(env, req, url);
      if (path.startsWith('/api/')) return json({ ok: false, err: 'khong-co' }, 404);
    } catch (e) {
      console.error('csq', path, e && e.stack || e);   // chi tiết chỉ nằm ở log Worker, không trả ra ngoài
      return json({ ok: false, err: 'loi' }, 500);
    }
    return env.ASSETS.fetch(req);
  },
};
