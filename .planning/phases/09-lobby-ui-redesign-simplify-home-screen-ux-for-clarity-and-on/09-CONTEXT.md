# Phase 9: Lobby UI Redesign — Context

## Vấn đề hiện tại (từ screenshot)

Màn hình lobby hiện tại có **quá nhiều lựa chọn** được nhồi nhét vào một trang dài cuộn, khiến:

1. **Quá tải thông tin (cognitive overload)**: Người chơi mới mở app lên thấy ngay 4 nút độ khó bot + ghép trận + cá cược + chế độ chơi + tạo phòng + nhập mã + đăng nhập — không biết bấm đâu trước.
2. **Không có hệ thống phân cấp (hierarchy)**: Tất cả hành động cùng một mức nổi bật (primary buttons liên tiếp), không có CTA chính rõ ràng.
3. **Luồng onboarding thiếu**: Người chơi lần đầu không hiểu "mức cược" là gì, "PTS" là gì, phải tạo phòng hay nhập mã.
4. **UI quá dài trên mobile**: Phải scroll nhiều để thấy hết options, cảm giác "overwhelming".
5. **Thiếu giải thích**: "Ghép trận nhanh" vs "Trận cá cược" vs "Tạo phòng mới" — khác nhau thế nào?

## Phân tích user flows chính

Có **3 luồng chơi** mà người dùng cần:

| # | Flow | Ai dùng | Tần suất |
|---|------|---------|----------|
| 1 | **Chơi nhanh** — bấm 1 nút, hệ thống tìm đối thủ | Mọi người | Cao nhất |
| 2 | **Chơi với bạn** — tạo/vào phòng bằng mã | Nhóm bạn bè | Trung bình |
| 3 | **Chơi với bot** — luyện tập, offline | Người mới, luyện | Thấp nhất |

Ngoài ra: cá cược (wagered) là phiên bản nâng cấp của flow 1, chỉ dành cho user đã đăng nhập.

## Đề xuất redesign

### Nguyên tắc thiết kế

- **Progressive disclosure**: Chỉ hiện thông tin khi cần. Không vứt hết ra lobby.
- **1 CTA chính**: Nút lớn nhất, nổi nhất = hành động phổ biến nhất.
- **Card-based sections**: Nhóm hành động liên quan vào card riêng, có icon + mô tả ngắn.
- **Bottom-sheet cho chi tiết**: Chọn độ khó bot, chọn mức cược → chỉ hiện khi user tap vào flow đó.

### Layout mới (wireframe concept)

```
┌─────────────────────────────────────┐
│       ⚓ TRẬN HẢI CHIẾN            │
│       Online · Sea Battle           │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ⚡ CHƠI NHANH              │    │  ← CTA chính, lớn nhất
│  │  Tìm đối thủ ngẫu nhiên    │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌──────────┐  ┌──────────────┐    │
│  │ 🤖 Bot   │  │ 👥 Với bạn   │    │  ← 2 card nhỏ cạnh nhau
│  │ Luyện tập│  │ Mã phòng    │    │
│  └──────────┘  └──────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │  ← Chỉ hiện khi đã đăng nhập
│  │  🪙 500 điểm                │    │
│  │  [Cá cược 10] [25] [50]    │    │
│  └─────────────────────────────┘    │
│                                     │
│  [❓ Cách chơi]    [⚙️ Cài đặt]   │
│                                     │
└─────────────────────────────────────┘
```

### Chi tiết từng phần:

#### 1. CTA "Chơi nhanh" (primary hero)
- Nút lớn nhất, gradient vàng (gold), chiếm full-width
- Subtitle nhỏ bên dưới: "Tìm đối thủ ngẫu nhiên · Cổ điển"
- Tap → vào queue ngay (mode mặc định = classic)
- Nếu muốn đổi mode (advance), có toggle nhỏ trong nút hoặc long-press

#### 2. Card "Bot" (compact)
- Icon 🤖 + "Luyện tập"
- Tap → bottom sheet chọn độ khó (Easy / Medium / Hard / Insane)
- Nhớ lựa chọn trước đó (localStorage)
- Bắt đầu ngay sau khi chọn

#### 3. Card "Với bạn" (compact)
- Icon 👥 + "Mã phòng"
- Tap → bottom sheet với 2 options:
  - "Tạo phòng" (hiện mã + copy)
  - "Vào phòng" (input nhập mã)

#### 4. Khu vực cá cược (chỉ khi đã login)
- Hiện balance + nút chọn stake nhanh
- Compact hơn — 1 dòng chips thay vì list dọc
- "Cá cược {n} đ — Tìm đối thủ"

#### 5. Mode toggle (Classic/Advance)
- **Không phải section riêng** — là toggle nhỏ ở góc hoặc trong settings
- Mặc định Classic. Advance hiện subtitle "⚡ Power-ups bật"
- Áp dụng cho tất cả flows (quick match, bot, room)

#### 6. Footer utility
- "❓ Cách chơi" + "⚙️ Cài đặt" (nhỏ, không chiếm không gian)
- Đăng nhập/Passkey → chuyển vào Settings hoặc avatar menu

### Cải thiện UX onboarding

- **Người chơi mới**: Chỉ thấy 3 lựa chọn rõ ràng (Chơi nhanh / Bot / Với bạn)
- **Tooltip lần đầu**: "Bấm Chơi nhanh để bắt đầu ngay!" (chỉ hiện 1 lần)
- **Bottom sheet có mô tả**: Khi mở Bot, giải thích "Dễ: bot bắn ngẫu nhiên. Khó: bot tìm tàu thông minh."
- **Points chỉ hiện khi có tài khoản**: Guest không thấy khu vực cá cược

### So sánh trước/sau

| Aspect | Hiện tại | Sau redesign |
|--------|----------|--------------|
| Số nút hiện ngay | 10+ nút | 3 nút chính |
| Scroll cần thiết | 2-3 màn hình | 1 màn hình (no scroll) |
| Thời gian quyết định | ~10s (overwhelm) | ~2s (rõ ràng) |
| Mode selection | Section riêng chiếm chỗ | Toggle nhỏ / sub-option |
| Cá cược | Inline luôn (confused guest) | Chỉ hiện khi logged in |
| Bot difficulty | 4 nút to ngang nhau | Bottom sheet khi cần |
| Join room | Input + button inline | Trong card "Với bạn" |

## Technical scope

- **File chính cần thay đổi:**
  - `public/app.jsx` — Lobby component + mới: BottomSheet, QuickPlayCard, BotCard, FriendCard
  - `public/style.css` — Toàn bộ `.lobby` section + thêm `.bottom-sheet`, `.play-card`
  - i18n keys: thêm/sửa labels mới

- **Không đổi:**
  - Server logic (matchmaking, room, bot — giữ nguyên)
  - Game flow sau khi vào trận (placement, battle)
  - Auth logic (giữ nguyên, chỉ đổi vị trí UI)

## Depends on

- Phase 7 (points economy) — cần biết balance/wager API để hiện đúng
- Phase 8 (passkey auth) — cần biết auth flow mới để bố trí đúng UI đăng nhập

Tuy nhiên, phase này có thể bắt đầu plan song song vì chỉ đổi layout, không đổi logic.
