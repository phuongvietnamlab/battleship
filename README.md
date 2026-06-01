# Battleship Online — Trận hải chiến

Game cờ hải chiến (Battleship) thời gian thực chạy trên **web**: bố trí hạm đội, mời bạn bè qua **mã phòng 5 ký tự**, đấu với **máy (bot)**, hoặc bật chế độ **power-up**. Giao diện **song ngữ Anh/Việt** (English mặc định, tự nhận tiếng Việt), **đồng hồ đếm ngược mỗi lượt**, **chat trong phòng**. Hỗ trợ chuột & cảm ứng.

---

## 1. Tính năng

### Lối chơi
- **3 cách vào trận**
  - Tạo phòng → nhận mã 5 ký tự → gửi bạn bè vào chung.
  - Nhập mã phòng để tham gia.
  - 🤖 Chơi với máy (bot offline, không cần đối thủ).
- **2 chế độ**
  - `classic` — hải chiến cổ điển.
  - `advance` — có power-up rơi ngẫu nhiên trên biển địch.
- **Bố trí hạm đội**: vào màn là 5 tàu (sân bay 5, thiết giáp 4, tuần dương 3, ngầm 3, khu trục 2) đã **xếp ngẫu nhiên sẵn** trên lưới 11×11; kéo-thả để di chuyển, chạm 2 lần để xoay, hoặc bấm 🎲 xếp lại; hỗ trợ cảm ứng.
- Bắn theo lượt, đếm ô trúng, phát hiện tàu chìm, màn thắng/thua, **chơi lại giữ tỉ số**. Người đi trước đổi so le mỗi ván.
- **Đồng hồ lượt 20 giây** (server-authoritative): hết giờ → bỏ lượt; bỏ lượt 3 lần liên tiếp (~1 phút lặng) → **xử thua**. Vòng tròn đếm ngược trên scoreboard, đỏ + nhấp nháy khi ≤10s.
- **Scoreboard** hiển thị điểm của cả 2 người, viền sáng ở người đang tới lượt. Mobile dùng 1 bàn cờ tự đổi enemy/own theo lượt.
- **Chat trong phòng**: gửi emoji nhanh / tin nhắn → hiện thành **bong bóng trên avatar ~3s** rồi tắt (không có khung log). Ẩn khi đấu máy.
- **Mời bạn**: chia sẻ mã phòng (chạm vào mã để chép) → bạn nhập mã ở màn hình chính là vào.
- **Nút "Cách chơi"** ở trang chủ (mở thủ công, không auto): giải thích luật + power-up.
- **Song ngữ EN/VI**: tự nhận locale qua `navigator.language`, English mặc định/fallback. Mọi chuỗi UI + lỗi server qua lớp i18n.
- Hiệu ứng âm thanh sinh bằng **Web Audio** (không cần file), tự mở khóa trên iOS Safari.

### Power-up (chế độ advance)
Nhặt bằng cách bắn trúng ô có power-up trên biển địch. Túi đồ: `scatter`, `cross`, `double`, `reveal`, `mine`.

| Power-up | Tác dụng |
|----------|----------|
| `scatter` | Nổ ngẫu nhiên 3–5 ô trên biển địch. |
| `cross`   | Bắn theo hình chữ thập (ô tâm + 4 ô kề). |
| `double`  | Cú bắn trượt kế tiếp vẫn được giữ lượt (bonus shot). |
| `reveal`  | Lộ ngẫu nhiên 1 ô tàu địch chưa trúng. |
| `mine`    | Đặt mìn lên ô trống của mình; địch bắn trúng sẽ bị mất + bỏ lượt. |

### Kết nối bền (mobile-first)
- Định danh theo `clientId` (lưu localStorage), có **grace 3 phút** khi rớt mạng → không mất ghế khi chuyển nền hay reload.
- Resume tự động: theo `clientId`, hoặc reclaim ghế offline chỉ bằng mã phòng.
- **Redis snapshot tùy chọn** (xem §6): khi đặt `REDIS_URL`, server chụp ảnh `rooms` định kỳ + lúc SIGTERM → khôi phục ván đang chơi qua restart/redeploy. Không đặt = chạy RAM thuần.

### Chống lạm dụng / vận hành
- Validate biên mọi tọa độ client gửi (`fire`/`useAbility`) → chặn payload chế tạo phình RAM/DoS.
- Throttle chat 400ms/người.
- Endpoint `/healthz` (liveness) + `/metrics` (số phòng, ván, người online, RAM, trạng thái Redis) để monitor.

---

## 2. Công nghệ

- **Backend**: Node.js + Express + Socket.IO. State ván đấu trong RAM (`rooms`), matchmaking theo mã phòng. **Redis tùy chọn** chỉ làm lớp snapshot (không phải hot-path — mỗi nước đi 0 round-trip Redis).
- **Frontend**: React 18 (1 file `public/app.jsx`), bundle bằng **esbuild** thành `app.js` self-contained (không CDN ngoài). Lớp i18n EN/VI ngay trong bundle.
- Server phục vụ luôn client (same-origin); có thể tách front-end host riêng và trỏ về server qua `wss://` bằng `SERVER_URL`.

---

## 3. Cấu trúc dự án

```
server.js              Socket.IO game server (rooms, lượt, đồng hồ, power-up, mìn, chat, reconnect)
store.js               Lớp Redis snapshot tùy chọn (no-op khi không có REDIS_URL)
public/
  app.jsx              Toàn bộ client React (i18n, lobby, bố trí, battle, chat, bot)
  index.html           HTML shell (SEO meta + Open Graph, nạp app.js)
  style.css            Giao diện hải quân (scoreboard, ring, chat, help)
  privacy.html         Trang chính sách riêng tư
  terms.html           Trang điều khoản
  site.webmanifest     PWA manifest (tên, icon, theme)
  robots.txt, sitemap.xml   SEO
  favicon.ico, favicon-16/32.png, apple-touch-icon.png, icon-192/512.png   icon
  og-image.jpg         Ảnh preview khi share link (1200×630)
  banner.jpg           Ảnh bìa dùng chung
build-game.mjs         esbuild → dist/  (bundle game)
render.yaml            Deploy lên Render
```

> URL tuyệt đối cho SEO (og:image, canonical, sitemap) trỏ domain chính `https://battleshiponline.xyz`. Đổi domain → sửa chuỗi đó trong `index.html`, `robots.txt`, `sitemap.xml`, `.github/workflows/keepalive.yml`.

### HTTP endpoints
- `GET /healthz` → liveness (uptime). Dùng cho health check Render / uptime monitor.
- `GET /metrics` → JSON: `rooms, activeGames, waitingRooms, players, online, rssMB, redis, uptimeSec`.

### Sự kiện Socket.IO chính
- **client→server**: `createRoom`, `joinRoom`, `resume`, `rejoin`, `placeShips`, `fire`, `useAbility`, `chat`, `rematch`, `leaveRoom`.
- **server→client**: `sync`, `roomUpdate`, `gameStart`, `incoming`, `turnUpdate`, `turnTimer`, `turnSkipped`, `scoreUpdate`, `inventory`, `powerups`, `chat`, `oppProfile`, `gameOver`, `opponentJoined/Left/Online/Offline`.
- Lỗi server trả **mã code** (vd `ROOM_NOT_FOUND`, `NOT_YOUR_TURN`, `BAD_CELL`), client dịch qua i18n.

### Hằng số ván đấu (`server.js`)
- `BOARD = 11` · `FLEET = [5,4,3,3,2]` · `TOTAL_CELLS = 17`
- `GRACE_MS = 180000` (giữ ghế 3 phút khi rớt) · `RESTORE_GRACE_MS = 300000` (sau khi restore từ snapshot)
- `TURN_MS = 20000` (đồng hồ lượt 20s) · `MAX_TIMEOUTS = 3` (bỏ lượt liên tiếp → xử thua)
- `SNAPSHOT_MS = 3000` (chu kỳ chụp Redis khi bật)

---

## 4. Chạy local

```bash
npm install
npm run build:game      # bundle public/app.jsx → dist/
npm start               # server đọc dist/ rồi tới public/
```
Mở http://localhost:4000 (đổi cổng: `PORT=5000 npm start`).

> `server.js` phục vụ `dist/` trước, fallback `public/`. Sau khi sửa `app.jsx` phải `npm run build:game` lại.

---

## 5. Deploy

### Render
`render.yaml` đã sẵn: Build `npm install && npm run build:game`, Start `npm start`. Render tự cấp `PORT`. Đẩy repo → render.com → New → Web Service → chọn repo.

> Render free tier ngủ sau ~15 phút không có traffic → request đầu sau khi ngủ bị cold-start vài giây. Cần luôn warm thì dùng gói trả phí hoặc uptime-ping `/healthz` (xem §7).

### Custom domain (`battleshiponline.xyz`)
1. Render dashboard → service → **Settings → Custom Domains** → add `battleshiponline.xyz` **và** `www.battleshiponline.xyz`.
2. Tại nhà cung cấp domain, trỏ DNS theo hướng dẫn Render (apex: ALIAS/ANAME hoặc A record; `www`: CNAME → `<service>.onrender.com`).
3. Render tự cấp SSL (Let's Encrypt) sau khi DNS propagate.
4. Đặt env `CANONICAL_HOST=battleshiponline.xyz` → host `*.onrender.com` tự 301 về domain chính (gộp URL cho SEO). Nên chọn 1 dạng canonical (apex **hoặc** www) và redirect dạng kia về — thẻ `<link rel="canonical">` đã trỏ apex.

### Tách front-end host riêng (tùy chọn)
Mặc định server phục vụ luôn client (same-origin). Nếu muốn host client ở nơi khác:
```bash
SERVER_URL=https://<app>.onrender.com npm run build:game   # client kết nối ngược về server qua wss://
```
Khi đó đặt `SITE_ORIGIN=https://<front-end-host>` trên server để CORS cho phép origin đó.

> `SERVER_URL` rỗng = same-origin. Đặt absolute `https://…` để client host riêng kết nối về server.

---

## 6. Ghi chú

### Redis snapshot (tùy chọn, tắt mặc định)
- Không đặt `REDIS_URL` → server chạy **RAM thuần**. Render hiện tại không cần đổi gì.
- Đặt `REDIS_URL` (vd Upstash free `rediss://…`) → server tự bật snapshot: chụp `rooms` mỗi 3s + lúc SIGTERM, khôi phục khi boot → **không mất ván đang chơi qua redeploy/restart**. Bật/tắt chỉ bằng env var, không sửa code.
- Đây **chỉ là lớp bền tạm cho game state**, không thay database.

### Biến môi trường
- `PORT` — cổng server (mặc định 4000; Render tự cấp).
- `REDIS_URL` — bật Redis snapshot (tùy chọn).
- `SITE_ORIGIN` — origin front-end host riêng, thêm vào CORS allowlist (tùy chọn).
- `SERVER_URL` — (build-time) URL server khi build client host riêng.
- `CANONICAL_HOST` — domain chính (vd `battleshiponline.xyz`). Đặt → server 301-redirect host `*.onrender.com` về domain này (gộp URL cho SEO). Không đặt = tắt.

### i18n
- Tự nhận locale qua `navigator.language`. Khớp `^vi` → tiếng Việt, còn lại → **English** (mặc định + fallback). Chưa có nút đổi tay — chỉ cần biến `LANG` thành state để thêm.

---

## 7. SEO & chống ngủ (Render free)

### SEO đã setup sẵn (`public/index.html`)
- Thẻ `<title>`, `description`, `keywords`, `canonical`, `robots`.
- **Open Graph** + **Twitter card** (preview khi share FB/Zalo/Messenger/X) → ảnh `og-image.jpg` 1200×630.
- **JSON-LD structured data** (`@type: VideoGame`) → Google hiểu đây là game miễn phí, hỗ trợ rich result.
- **Nội dung crawlable**: `<h1>` + đoạn mô tả song ngữ (off-screen `.sr-only`, chính xác — không cloaking) và `<noscript>` đầy đủ. Vì game là SPA React (body rỗng), phần này cho Googlebot chữ để index.
- `site.webmanifest`, `favicon`/icon đủ cỡ, `robots.txt`, `sitemap.xml`.

> ⚠️ **Domain chính**: `https://battleshiponline.xyz` (custom domain trỏ về Render). Nếu đổi → sửa chuỗi đó trong `public/index.html` (canonical, og:url, og:image, twitter:image, JSON-LD url+image), `public/robots.txt`, `public/sitemap.xml`, và `.github/workflows/keepalive.yml`.

### Sau khi deploy — đăng ký Google
1. Vào **Google Search Console** → thêm property (URL prefix = URL Render).
2. Xác minh (HTML tag hoặc DNS).
3. **Sitemaps** → submit `sitemap.xml`.
4. **URL Inspection** → "Request indexing" cho trang chủ.

### Chống ngủ (giữ SEO + first-load nhanh)
Render free spin-down sau ~15 phút idle → cold-start ~30–60s. Googlebot ghé lúc ngủ → crawl chậm/fail → hại rank. Giải:

- **GitHub Actions cron** (đã có `.github/workflows/keepalive.yml`): ping `/healthz` mỗi 10 phút, mặc định `https://battleshiponline.xyz/healthz`. Đổi được qua repo → Settings → Secrets and variables → Actions → **Variables** → `KEEPALIVE_URL`. GH cron có thể trễ 5–15 phút và **tự tắt sau 60 ngày không commit**.
- **Tin cậy hơn** (khuyến nghị, khỏi bảo trì): monitor ngoài **UptimeRobot** hoặc **cron-job.org** (free) → ping `/healthz` mỗi 5–10 phút. Dán URL là xong.
- Always-on ≈ 720h/tháng, dưới hạn 750h free của Render → vẫn miễn phí.
