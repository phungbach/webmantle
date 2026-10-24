# Triển khai Webmantle bằng Docker

Dự án có sẵn `Dockerfile` và `docker-compose.yml`. Container chạy một tiến trình Node. Cơ sở dữ liệu (SQLite), ảnh tải lên, giao diện đã cài và bản sao lưu nằm trong một volume, nên bạn có thể thay container bất cứ lúc nào mà không mất dữ liệu.

## Cần chuẩn bị

- Docker 24 trở lên có plugin Compose (kiểm tra bằng `docker compose version`).
- Máy chủ hoặc máy tính còn trống khoảng 2 GB bộ nhớ để build image và 1 GB đĩa cho image.

## Bắt đầu nhanh

```bash
git clone https://github.com/TÀI-KHOẢN/webmantle.git
cd webmantle
cp .env.example .env
```

Sửa file `.env` (file này không bao giờ được commit hay chép vào image):

```
SITE_URL="https://ten-mien-cua-ban.com"
PREVIEW_SECRET="<chuỗi ngẫu nhiên dài, từ 32 ký tự>"
ADMIN_EMAIL="ban@ten-mien-cua-ban.com"
ADMIN_PASSWORD="<từ 12 ký tự>"
ADMIN_NAME="Quản trị viên"
TRUST_PROXY="true"
```

Tạo `PREVIEW_SECRET` bằng lệnh `openssl rand -base64 48`. `DATABASE_URL` và `CMS_DATA_DIR` đã được `docker-compose.yml` đặt sẵn, nên không cần ghi vào `.env`.

Sau đó chạy:

```bash
docker compose up -d --build
docker compose logs -f web
```

Khi khởi động, container tự áp dụng các bản cập nhật cơ sở dữ liệu, cài các giao diện có sẵn và tạo quản trị viên đầu tiên (chạy lại nhiều lần vẫn an toàn). Khi log hiện `Ready`, mở `http://MÁY-CHỦ:3000/login`.

## Chạy không dùng Compose

```bash
docker build -t webmantle:1.0.0 .
docker run -d --name webmantle --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -e CMS_DATA_DIR=/app/data -e DATABASE_URL=file:/app/data/cms.db \
  -v webmantle-data:/app/data \
  webmantle:1.0.0
```

`docker run --env-file` giữ nguyên dấu nháy như một phần của giá trị. Vì vậy, với file dùng theo cách này, hãy viết `KEY=value` không có dấu nháy.

## HTTPS và tên miền

Đặt một reverse proxy phía trước. Chỉ để `TRUST_PROXY="true"` khi proxy đó ghi đè header `X-Forwarded-For`. Ví dụ với Caddy (tự cấp chứng chỉ):

```
ten-mien-cua-ban.com {
  reverse_proxy 127.0.0.1:3000
}
```

Ví dụ với nginx:

```
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 12m;
}
```

Giới hạn 12 MB khớp với dung lượng tải lên lớn nhất mà CMS chấp nhận (file ZIP giao diện và ảnh).

## Nâng cấp phiên bản

```bash
git pull            # hoặc giải nén bản phát hành mới
docker compose up -d --build
```

Volume giữ nguyên dữ liệu của bạn. Mỗi lần khởi động, container chạy lại `prisma migrate deploy` và seed, đồng thời cập nhật các giao diện có sẵn (bản cũ của giao diện được sao lưu lại).

## Sao lưu

```bash
docker compose exec web npm run db:backup
docker cp webmantle:/app/data/backups ./backups
```

Để sao lưu cả volume: `docker run --rm -v webmantle_webmantle-data:/data -v "$PWD":/out alpine tar czf /out/webmantle-data.tgz -C /data .` (tên volume có tiền tố là tên dự án Compose). Cách khôi phục xem [backup-and-restore.md](backup-and-restore.md).

## Các thiết lập có thể cần

| Biến                          | Ý nghĩa                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKIP_SEED=true`              | Không chạy seed khi khởi động (vẫn chạy cập nhật cơ sở dữ liệu).                                                                                                                |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | Tạo tài khoản demo chỉ xem ở lần seed đầu.                                                                                                                                      |
| `DEMO_PUBLIC_LOGIN=true`      | Bật liên kết `/demo` tự đăng nhập khách vào tài khoản demo. Chỉ bật trên site có dữ liệu mẫu: tài khoản demo xem được mọi thứ mà khu quản trị hiển thị.                         |
| `TRUST_PROXY=true`            | Lấy địa chỉ khách từ `X-Forwarded-For` (chỉ dùng khi đứng sau proxy do bạn kiểm soát).                                                                                          |

## Xử lý sự cố

| Triệu chứng                          | Nguyên nhân thường gặp và cách sửa                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container khởi động lại liên tục     | Xem `docker compose logs web`. Thường do thiếu `ADMIN_EMAIL` hoặc `ADMIN_PASSWORD` ở lần đầu, hoặc mật khẩu ngắn hơn 12 ký tự.                           |
| "Unable to open the database file"   | Người dùng `node` không ghi được vào volume. Tạo lại volume, hoặc chạy `docker compose down` và xóa volume do `root` tạo.                                |
| Prisma không nạp được engine         | Image dùng Debian có OpenSSL (cài trong Dockerfile). Đừng đổi sang Alpine nếu chưa thêm `binaryTargets` cho musl.                                        |
| Build bị dừng hoặc rất chậm          | Cấp cho Docker ít nhất 2 GB bộ nhớ.                                                                                                                      |
| Giới hạn đăng nhập áp dụng cho mọi người | Đặt `TRUST_PROXY=true` khi chạy sau proxy của bạn.                                                                                                   |
