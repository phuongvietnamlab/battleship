# Battleship Online

Game cờ hải chiến (Battleship) chơi online cùng bạn bè qua mã phòng.

## Tính năng
- Mời bạn chơi online bằng **mã phòng 5 ký tự**.
- **Kéo-thả** tàu vào vị trí tùy ý (hỗ trợ chuột & cảm ứng điện thoại), xoay ngang/dọc.
- Hình tàu chiến vẽ chi tiết, giao diện hải quân, hiệu ứng nổ/tóe nước.
- Bắn theo lượt, đếm số ô trúng, màn hình thắng/thua + chơi lại.

## Công nghệ
- Backend: Node.js + Express + Socket.IO
- Frontend: React (CDN) — không cần bước build

## Chạy local
```bash
npm install
npm start
```
Mở http://localhost:4000 (hoặc đặt cổng khác: `PORT=5000 npm start`).

## Deploy (Render – free)
1. Đẩy repo này lên GitHub.
2. render.com → New → Web Service → chọn repo.
3. Build Command: `npm install` · Start Command: `npm start`.
4. Render tự cấp biến `PORT`; app đọc `process.env.PORT` nên chạy ngay.
