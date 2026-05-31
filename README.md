# Battleship Online — Trận hải chiến

Game cờ hải chiến (Battleship) thời gian thực: bố trí hạm đội, mời bạn bè qua **mã phòng 5 ký tự** hoặc **chia sẻ Messenger**, đấu với **máy (bot)**, hoặc bật chế độ **power-up**. Giao diện **song ngữ Anh/Việt** (English mặc định, tự nhận tiếng Việt), **đồng hồ đếm ngược mỗi lượt**, **chat trong phòng**, **tự đăng nhập + avatar Facebook**. Hỗ trợ chuột & cảm ứng, đóng gói chạy được trên web lẫn **Facebook Instant Games**.

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
- **Scoreboard** hiển thị **avatar + tên + điểm** của cả 2 người (đồng bộ hồ sơ FB), viền sáng ở người đang tới lượt. Mobile dùng 1 bàn cờ tự đổi enemy/own theo lượt (không còn nút tab).
- **Chat trong phòng**: gửi emoji nhanh / tin nhắn → hiện thành **bong bóng trên avatar ~3s** rồi tắt (không có khung log). Ẩn khi đấu máy.
- **Mời qua Messenger** (`shareAsync`): gửi thẻ mời có ảnh + mã phòng; bạn bè tap là vào thẳng phòng.
- **Tự đăng nhập Facebook** (Instant Games auto-auth): hiện avatar + tên người chơi góc phải trên.
- **Nút "Cách chơi"** ở trang chủ (mở thủ công, không auto): giải thích luật + power-up.
- **Song ngữ EN/VI**: tự nhận locale, English mặc định/fallback. Mọi chuỗi UI + lỗi server qua lớp i18n.
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
- Định danh theo `clientId`, có **grace 3 phút** khi rớt mạng → không mất ghế khi iPhone/Safari chuyển nền hay app restart.
- Nhiều lớp resume: theo `clientId`, theo **context Messenger**, hoặc reclaim ghế offline chỉ bằng mã phòng.
- Trên FB: định danh ưu tiên **App-Scoped ID** (`getASIDAsync`) → signed ASID → legacy player id → localStorage/random. Con trỏ phòng lưu **FB Cloud Save** để bền qua restart.
- **Redis snapshot tùy chọn** (xem §6): khi đặt `REDIS_URL`, server chụp ảnh `rooms` định kỳ + lúc SIGTERM → khôi phục ván đang chơi qua restart/redeploy. Không đặt = chạy RAM thuần như cũ.

### Chống lạm dụng / vận hành
- Validate biên mọi tọa độ client gửi (`fire`/`useAbility`) → chặn payload chế tạo phình RAM/DoS.
- Throttle chat 400ms/người; profile FB được sanitize trước khi lưu/relay.
- Endpoint `/healthz` (liveness) + `/metrics` (số phòng, ván, người online, RAM, trạng thái Redis) để monitor.

---

## 2. Công nghệ

- **Backend**: Node.js + Express + Socket.IO. State ván đấu trong RAM (`rooms`), matchmaking theo mã phòng. **Redis tùy chọn** chỉ làm lớp snapshot (không phải hot-path — mỗi nước đi 0 round-trip Redis).
- **Frontend**: React 18 (1 file `public/app.jsx`), bundle bằng **esbuild** thành `app.js` self-contained (không CDN ngoài, trừ SDK `fbinstant` **8.0**). Lớp i18n EN/VI ngay trong bundle.
- **Đóng gói FB Instant Games**: bundle `dist/` upload lên Facebook; server chạy riêng trên Fly/Render, client kết nối qua `wss://`.

---

## 3. Cấu trúc dự án

```
server.js              Socket.IO game server (rooms, lượt, đồng hồ, power-up, mìn, chat, reconnect)
store.js               Lớp Redis snapshot tùy chọn (no-op khi không có REDIS_URL)
public/
  app.jsx              Toàn bộ client React (i18n, lobby, bố trí, battle, chat, bot, FB boot)
  index.html           HTML shell (nạp fbinstant SDK + app.js)
  style.css            Giao diện hải quân (scoreboard, ring, chat, profile, help)
  fbapp-config.json    Cấu hình Instant Games (portrait, nav bar)
  spike/               T0 spike: kiểm tra WSS + tính ổn định player id (xem SPIKE.md)
build-game.mjs         esbuild → dist/  (bundle game thật)
build-spike.mjs        esbuild → dist-spike/  (bundle spike)
Dockerfile, fly.toml   Deploy server lên Fly.io (region sin)
render.yaml            Deploy lên Render
SPIKE.md               Hướng dẫn chạy spike go/no-go
```

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

### Render (đơn giản nhất)
`render.yaml` đã sẵn: Build `npm install && npm run build:game`, Start `npm start`. Render tự cấp `PORT`. Đẩy repo → render.com → New → Web Service → chọn repo.

### Fly.io (server cho FB)
```bash
fly launch --no-deploy     # xác nhận app name + region (sin)
fly deploy
fly status                 # ghi lại URL https://<app>.fly.dev
```
Fly giữ 1 máy luôn warm (`min_machines_running = 1`) → không cold-start cho lượt chơi real-time.

### Facebook Instant Games
```bash
# build client trỏ tới server đã deploy (wss)
SERVER_URL=https://<app>.fly.dev npm run build:game     # hoặc battleship.onrender.com
```
- Zip **nội dung** thư mục `dist/` (`index.html` ở top-level ZIP, cạnh `app.js`, `style.css`, `fbapp-config.json`).
- developers.facebook.com → tạo app → thêm product **Instant Games** → upload ZIP.

> `SERVER_URL` rỗng = same-origin (local). Đặt absolute `https://…` để client trên FB kết nối ngược về server qua `wss://`.

---

## 6. Ghi chú

### Redis snapshot (tùy chọn, tắt mặc định)
- Không đặt `REDIS_URL` → server chạy **RAM thuần**, y như cũ. Render hiện tại không cần đổi gì.
- Đặt `REDIS_URL` (vd Upstash free `rediss://…`) → server tự bật snapshot: chụp `rooms` mỗi 3s + lúc SIGTERM, khôi phục khi boot → **không mất ván đang chơi qua redeploy/restart**. Bật/tắt chỉ bằng env var, không sửa code.
- Đây **chỉ là lớp bền tạm cho game state**, không thay database. Leaderboard/tài khoản (nếu làm sau) cần Postgres riêng.

### i18n
- Tự nhận locale: `FBInstant.getLocale()` → `navigator.language`. Khớp `^vi` → tiếng Việt, còn lại → **English** (mặc định + fallback). Chưa có nút đổi tay — chỉ cần biến `LANG` thành state để thêm.

### FB profile / auto-login / định danh
- Instant Games **tự xác thực** người chơi (không có bước login). Avatar + tên lấy qua `player.getName()/getPhoto()`, **chỉ thật trên nền FB**; web/local dùng fallback chữ cái đầu. Hai người trao đổi profile qua sự kiện `oppProfile`.
- **Định danh ưu tiên**: `getASIDAsync()` → signed ASID → `getID()` → localStorage/random. Thực tế (IG Debug, SDK 8.0): **`getID()` trả id thật ổn định** (vd `fb_2726…`) ngay cả khi **ASID = null** → mã tự fallback sang `getID`, auto-resume vẫn chạy. (Context = null khi mở solo; `subscribeBotAsync` lỗi do không gắn Page — đều không dùng.)

### Khác
- **Spike (`SPIKE.md`)**: kiểm tra trước khi port — WSS có chạy trong container Instant Games không, và `player.getID()` có ổn định qua reload không. Còn nguyên để làm template deploy.
- **Giới hạn dev FB**: một số build/context, `getASIDAsync` trả null; mã đã fallback `getID` → vẫn có định danh bền. Trường hợp cả hai null (hiếm) thì dựa localStorage + nhập mã phòng tay.
- **IG Debug**: bật trong app FB dev. Chọn `8.0 [Network Enabled Zero Permissions]` để test sát môi trường live (player API hạn chế). Dropdown chỉ ảnh hưởng phiên debug, không đổi bản đã upload.
