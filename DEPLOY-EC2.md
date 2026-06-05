# Deploy Battleship Online lên AWS EC2 — Hướng dẫn chi tiết

## Chi phí

| Resource | Specs | Chi phí/tháng |
|----------|-------|---------------|
| EC2 t3.micro | 2 vCPU, 1GB RAM | **$8.35** (on-demand) |
| EBS gp3 | 20GB storage | **$1.60** |
| Data transfer | ~5GB outbound/tháng | **$0.45** |
| Elastic IP | 1 IP tĩnh (khi instance running) | **$0** |
| **Tổng** | | **~$10.4/tháng** |

> Nếu AWS account mới (< 12 tháng): t3.micro FREE 750h/tháng → **$0 trong năm đầu**.
>
> Tiết kiệm thêm: mua Reserved Instance 1 năm = ~$5.5/tháng.

---

## Bước 1: Tạo AWS Account

1. Vào https://aws.amazon.com → **Create an AWS Account**
2. Điền email, tên, thẻ visa/mastercard (charge $1 verify rồi hoàn lại)
3. Chọn plan **Basic Support (Free)**
4. Đợi vài phút activate

---

## Bước 2: Tạo EC2 Instance

1. Đăng nhập AWS Console → tìm **EC2** → click **Launch Instance**

2. **Name**: `battleship-server`

3. **AMI (hệ điều hành)**: 
   - Chọn **Ubuntu Server 24.04 LTS** (Free tier eligible)
   - Architecture: **64-bit (x86)**

4. **Instance type**: 
   - Chọn **t3.micro** (2 vCPU, 1GB RAM)
   - Đủ chạy Node.js + Postgres + Redis + Nginx cho ~50 concurrent players
   - Free tier eligible

5. **Key pair**:
   - Click **Create new key pair**
   - Name: `battleship-key`
   - Type: RSA
   - Format: `.pem`
   - Download và **lưu cẩn thận** — mất là không recovery được

6. **Network settings** → click **Edit**:
   - Auto-assign Public IP: **Enable**
   - Security Group: **Create security group**
   - Name: `battleship-sg`
   - Rules (Add rule cho mỗi dòng):

   | Type | Port | Source | Mục đích |
   |------|------|--------|----------|
   | SSH | 22 | My IP | Bạn SSH vào |
   | HTTP | 80 | 0.0.0.0/0 | Web traffic |
   | HTTPS | 443 | 0.0.0.0/0 | Web traffic SSL |

7. **Storage**:
   - Size: **20 GiB**
   - Type: **gp3**
   - Delete on termination: **No** (giữ data nếu terminate nhầm)

8. Click **Launch Instance**

---

## Bước 3: Gán Elastic IP (IP tĩnh)

Mặc định EC2 đổi IP mỗi lần restart. Cần IP cố định:

1. EC2 Console → **Elastic IPs** (sidebar trái)
2. Click **Allocate Elastic IP address** → **Allocate**
3. Chọn IP vừa tạo → **Actions** → **Associate Elastic IP address**
4. Chọn instance `battleship-server` → **Associate**

Ghi lại IP này (ví dụ: `54.123.45.67`) — đây là IP cố định của server.

---

## Bước 4: SSH vào server

Mở terminal (hoặc PowerShell):

```bash
# Windows PowerShell
ssh -i "battleship-key.pem" ubuntu@54.123.45.67

# Nếu báo permission error trên Windows:
icacls battleship-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

---

## Bước 5: Cài Docker

```bash
# Cài Docker
curl -fsSL https://get.docker.com | sudo sh

# Cho phép user ubuntu dùng docker không cần sudo
sudo usermod -aG docker ubuntu

# QUAN TRỌNG: logout và login lại
exit
```

SSH lại:
```bash
ssh -i "battleship-key.pem" ubuntu@54.123.45.67

# Verify
docker --version
docker compose version
```

---

## Bước 6: Cài Git và clone repo

```bash
sudo mkdir -p /opt/battleship
sudo chown ubuntu:ubuntu /opt/battleship
cd /opt/battleship
```

### Nếu repo PUBLIC:
```bash
git clone https://github.com/phuongvietnamlab/battleship.git .
```

### Nếu repo PRIVATE (dùng Deploy Key — an toàn nhất):

**Trên EC2** — tạo SSH key:
```bash
ssh-keygen -t ed25519 -C "battleship-deploy" -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub
```
Copy dòng bắt đầu bằng `ssh-ed25519 AAAA...` (đó là PUBLIC key).

**Trên GitHub** — thêm Deploy Key:
1. Vào https://github.com/phuongvietnamlab/battleship/settings/keys
2. Click **Add deploy key**
3. Title: `battleship-ec2`
4. Key: paste dòng `ssh-ed25519 AAAA...` (PUBLIC key, KHÔNG phải private key)
5. Tick **Allow write access**
6. Click **Add key**

**Trên EC2** — config SSH dùng deploy key:
```bash
cat > ~/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/deploy_key
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/deploy_key
```

Clone:
```bash
git clone git@github.com:phuongvietnamlab/battleship.git .
```

Verify:
```bash
git remote -v
# → origin  git@github.com:phuongvietnamlab/battleship.git
```

---

## Bước 7: Tạo file .env

```bash
cd /opt/battleship

# Generate passwords
DB_PASS=$(openssl rand -hex 16)
REDIS_PASS=$(openssl rand -hex 16)
SESSION=$(openssl rand -hex 32)

echo "DB_PASSWORD=${DB_PASS}"
echo "REDIS_PASSWORD=${REDIS_PASS}"
echo "SESSION_SECRET=${SESSION}"
```

Copy 3 giá trị trên, rồi tạo .env:

```bash
nano .env
```

Paste nội dung (thay giá trị thật):

```env
DB_PASSWORD=<paste DB_PASS>
REDIS_PASSWORD=<paste REDIS_PASS>
SESSION_SECRET=<paste SESSION>

# OAuth (để trống nếu chưa có — app vẫn chạy)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://battleshiponline.xyz/auth/google/callback

FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
FACEBOOK_CALLBACK_URL=https://battleshiponline.xyz/auth/facebook/callback

# Hosting
APP_BASE_URL=https://battleshiponline.xyz
CANONICAL_HOST=battleshiponline.xyz
```

Lưu: `Ctrl+O` → Enter → `Ctrl+X`

---

## Bước 8: Tạo thư mục backup

```bash
mkdir -p /opt/battleship/backups
```

---

## Bước 9: Khởi chạy

```bash
cd /opt/battleship

# Build và start tất cả services
docker compose -f docker-compose.prod.yml up -d

# Xem logs (đợi ~30s cho DB ready + migrations chạy)
docker compose -f docker-compose.prod.yml logs -f app
```

Khi thấy:
```
Battleship server running at http://localhost:4000
```
→ Thành công. Nhấn `Ctrl+C` thoát logs.

---

## Bước 10: Verify

```bash
# Health check
curl http://localhost/healthz

# Xem tất cả containers
docker compose -f docker-compose.prod.yml ps
```

Mở browser: `http://54.123.45.67` → thấy game.

---

## Bước 11: Setup domain + HTTPS

### 11a. Trỏ domain

Vào DNS provider (Cloudflare, Namecheap, Route53...) → thêm A record:
```
Type: A
Name: @
Value: <Elastic IP của bạn>
TTL: 300
```

Thêm thêm 1 record cho www:
```
Type: A
Name: www
Value: <Elastic IP của bạn>
TTL: 300
```

Đợi ~5 phút DNS propagate. Verify:
```bash
ping battleshiponline.xyz
# → phải hiện IP EC2 của bạn
```

### 11b. Cài certbot trên host

```bash
sudo apt install -y certbot
```

### 11c. Lấy SSL certificate

```bash
# Tắt nginx tạm (certbot cần dùng port 80)
docker compose -f docker-compose.prod.yml stop nginx

# Lấy certificate
sudo certbot certonly --standalone \
  -d battleshiponline.xyz \
  --email phamvuphuong98@gmail.com \
  --agree-tos --no-eff-email

# Bật lại nginx
docker compose -f docker-compose.prod.yml start nginx
```

Certificate lưu tại `/etc/letsencrypt/live/battleshiponline.xyz/`.
Nginx container mount thẳng từ host nên đọc được ngay.

### 11d. Bật HTTPS trong nginx.conf

```bash
nano nginx.conf
```

Uncomment block `server { listen 443 ssl ... }` ở cuối file.
Thay tất cả `yourdomain.com` → `battleshiponline.xyz`.

Restart nginx:
```bash
docker compose -f docker-compose.prod.yml restart nginx
```

Verify: mở `https://battleshiponline.xyz` trên browser.

### 11e. Auto-renew certificate

```bash
sudo crontab -e
```

Thêm dòng (renew mỗi 2 tháng lúc 3h sáng):
```
0 3 1 */2 * certbot renew --pre-hook "cd /opt/battleship && docker compose -f docker-compose.prod.yml stop nginx" --post-hook "cd /opt/battleship && docker compose -f docker-compose.prod.yml start nginx" --quiet
```

### 11f. Cập nhật .env với domain

```bash
nano /opt/battleship/.env
```

Đảm bảo có:
```env
CANONICAL_HOST=battleshiponline.xyz
APP_BASE_URL=https://battleshiponline.xyz
GOOGLE_CALLBACK_URL=https://battleshiponline.xyz/auth/google/callback
FACEBOOK_CALLBACK_URL=https://battleshiponline.xyz/auth/facebook/callback
```

Restart app:
```bash
docker compose -f docker-compose.prod.yml restart app
```

---

## Bước 12: Setup GitHub Actions auto-deploy

### 12a. Thêm Secrets trên GitHub

Vào repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Value |
|------|-------|
| `EC2_HOST` | `54.123.45.67` (Elastic IP) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Mở file `battleship-key.pem` → copy TOÀN BỘ nội dung (kể cả BEGIN/END) |

### 12b. Test

Push code lên main:
```bash
git add .
git commit -m "deploy: initial setup"
git push origin main
```

Vào GitHub → tab **Actions** → xem workflow chạy. Sau ~30s sẽ thấy "✅ Deployed".

---

## Backup & Migrate sang EC2 khác

### Backup thủ công

```bash
cd /opt/battleship
chmod +x scripts/backup.sh
./scripts/backup.sh
# → tạo backups/full-backup-YYYYMMDD-HHMMSS.tar.gz
```

### Migrate sang EC2 mới

```bash
# 1. Trên EC2 CŨ — backup
./scripts/backup.sh

# 2. Copy backup sang EC2 MỚI
scp -i key.pem backups/full-backup-*.tar.gz ubuntu@NEW_IP:/opt/battleship/backups/

# 3. Trên EC2 MỚI — restore
cd /opt/battleship
chmod +x scripts/restore.sh
./scripts/restore.sh backups/full-backup-20260604-143000.tar.gz

# 4. Update DNS trỏ domain sang IP mới
# 5. Chạy lại certbot nếu IP đổi (certificate vẫn valid nếu domain không đổi)
```

---

## Quản lý hàng ngày

```bash
# Xem status
docker compose -f docker-compose.prod.yml ps

# Xem logs app
docker compose -f docker-compose.prod.yml logs -f app --tail 50

# Restart app (không ảnh hưởng DB)
docker compose -f docker-compose.prod.yml restart app

# Update code thủ công (không đợi CI)
cd /opt/battleship
git pull origin main
docker compose -f docker-compose.prod.yml build --no-cache app
docker compose -f docker-compose.prod.yml up -d --no-deps app

# Vào PostgreSQL shell
docker compose -f docker-compose.prod.yml exec postgres psql -U battleship

# Vào Redis shell
docker compose -f docker-compose.prod.yml exec redis redis-cli -a $REDIS_PASSWORD

# Season reset (ranked)
docker compose -f docker-compose.prod.yml exec app node scripts/season-reset.js
```

---

## Troubleshooting

| Vấn đề | Giải pháp |
|--------|-----------|
| Container crash loop | `docker compose -f docker-compose.prod.yml logs app` xem error |
| DB connection refused | `docker compose -f docker-compose.prod.yml ps` kiểm tra postgres healthy |
| Port 80 không mở | Kiểm tra Security Group trên AWS Console |
| SSH timeout | Kiểm tra Security Group có rule port 22 cho IP bạn |
| Disk full | `docker system prune -a` + xóa backup cũ |
| RAM hết | `docker stats` xem container nào ngốn nhiều |

---

## Security checklist

- [x] Postgres/Redis không expose port ra internet (internal network only)
- [x] Redis có password
- [x] App container read-only filesystem
- [x] Nginx rate limiting trên auth routes
- [x] Security headers (X-Frame-Options, HSTS, etc.)
- [x] SSH chỉ cho IP của bạn (Security Group)
- [x] .env không commit vào git
- [x] Backup tự động mỗi 24h, giữ 7 ngày
- [ ] Bật MFA cho AWS account (Settings → Security credentials)
- [ ] Đổi SSH port 22 → port khác (optional, thêm paranoia)
