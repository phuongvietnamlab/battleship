# Phase 13: Match History — Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Cho phép user đã đăng nhập xem lại lịch sử trận đấu của mình — danh sách các trận đã đánh với thông tin đầy đủ: đối thủ, kết quả thắng/thua, point cược và point nhận, thời gian, mode, lý do kết thúc.

**Scope:**
- Trang lịch sử trận đấu (match history page)
- API endpoint lấy danh sách trận
- Xem profile đối thủ (win rate, tổng trận) khi click avatar trong trận đấu
- Guest KHÔNG xem được lịch sử (không có persistent identity)

**Out of scope:**
- Xem chi tiết từng nước đi (replay) — đã cut from vision
- Xem lịch sử trận của người khác
- Export/share lịch sử

</domain>

<decisions>
## Implementation Decisions

### UI Placement
- Button "Lịch sử" đặt ở lobby, dưới mục "Cách chơi / Hướng dẫn"
- Click vào → mở trang match history (full screen, không phải bottom sheet)

### Match History Page Layout
- Scroll nội bộ (overflow scroll) trong container — KHÔNG scroll toàn trang (tránh dịch màn hình mobile)
- Pagination qua internal scroll + load more khi cuộn xuống cuối
- Mỗi trận hiển thị:
  - Avatar + tên đối thủ
  - Kết quả: Thắng ✅ / Thua ❌
  - Stake (điểm cược) + điểm nhận/mất
  - Thời gian bắt đầu trận
  - Mode: Classic / Advance
  - Lý do kết thúc: normal, timeout, disconnect, leave

### Filters
- Kết quả: Tất cả / Thắng / Thua
- Mode: Tất cả / Classic / Advance
- Cược: Tất cả / Có cược (stake > 0) / Không cược (stake = 0)

### Opponent Profile (Mini)
- Trong trận đấu (battle screen), click avatar đối thủ → popup/tooltip hiển thị:
  - Win rate (%)
  - Tổng số trận
- KHÔNG cho xem danh sách lịch sử trận của đối thủ

### Access Control
- Chỉ signed-in user mới xem được lịch sử
- Guest click nút → prompt đăng nhập hoặc ẩn nút
- API endpoint yêu cầu authenticated session

### Data Source
- Bảng `matches` đã có sẵn từ Phase 3:
  - id, winner_id, loser_id, reason, mode, started_at, ended_at, stake
  - Indexes: winner_id, loser_id, ended_at DESC
- Cần JOIN users để lấy display_name, avatar_url của đối thủ
- Tính win rate = COUNT wins / COUNT total matches cho opponent profile

### Claude's Discretion
- Số trận mỗi lần load (page size) — suggest 20
- Animation/transition khi mở trang
- Empty state khi chưa có trận nào
- Date formatting (relative time vs absolute)

</decisions>

<canonical_refs>
## Canonical References

### Database Schema
- `migrations/004_matches.sql` — matches table DDL
- `migrations/006_points_economy.sql` — stake column addition

### Server
- `db.js` (recordMatch function) — match write logic, shows all columns stored
- `server.js` — socket event handlers calling recordMatch

### Client
- `public/app.jsx` — main React app, lobby component, screen routing

</canonical_refs>

<specifics>
## Specific Ideas

- Nút lịch sử nằm dưới nút "Cách chơi" trong lobby
- Scroll container fixed height (calc 100vh - header), overflow-y: auto
- Load more khi scroll đến bottom (IntersectionObserver hoặc scroll event)
- Filter bar sticky ở top của container
- Mỗi match item là card/row compact: [Avatar] [Tên] [W/L badge] [Points +/-] [Time] [Mode chip]

</specifics>

<deferred>
## Deferred Ideas

- Xem chi tiết từng nước đi (replay) — cut from vision
- Xem lịch sử trận của người khác — privacy concern
- Statistics dashboard (charts, streaks, etc.) — v2 retention feature

</deferred>

---

*Phase: 13-match-history*
*Context gathered: 2026-06-05 via discuss-phase*
