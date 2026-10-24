# Webmantle: hướng dẫn build và chạy bằng Docker (CLI)

Webmantle là hệ thống quản trị nội dung (CMS) nhiều giao diện, viết bằng Next.js và SQLite. Tài liệu này hướng dẫn build và chạy bằng Docker với công cụ dòng lệnh `scripts/webmantle.sh`.

## Yêu cầu

- Docker Desktop (hoặc Docker Engine 24 trở lên có plugin Compose). Kiểm tra: `docker compose version`.
- Còn trống ít nhất 4 GB đĩa và khoảng 2 GB bộ nhớ để build lần đầu. Khi chạy, container giới hạn 1 GB.
- macOS, Linux, hoặc Windows với WSL.

## Bắt đầu trong 3 bước

```bash
git clone https://github.com/TÀI-KHOẢN/webmantle.git
cd webmantle
```

**1. Tạo file cấu hình.** CLI hỏi địa chỉ website, email và mật khẩu quản trị (từ 12 ký tự), tự sinh khóa bí mật:

```bash
scripts/webmantle.sh init
```

**2. Build và chạy:**

```bash
scripts/webmantle.sh up
```

Lần đầu mất vài phút. Khi xong, CLI in `Sẵn sàng: http://localhost:3000`.

**3. Đăng nhập** tại `http://localhost:3000/login` bằng email và mật khẩu đã nhập ở bước 1.

Bạn cũng gọi được qua npm: `npm run docker -- up`.

## Các lệnh

| Lệnh | Việc làm |
| --- | --- |
| `init` | Tạo `.env` từ `.env.example`, sinh `PREVIEW_SECRET`, hỏi thông tin quản trị |
| `build` | Chỉ build image `webmantle:1.0.0` |
| `up` | Build (nếu cần) và chạy website ở nền, chờ đến khi sẵn sàng |
| `update` | Build lại và khởi động lại bằng bản mới, giữ nguyên dữ liệu |
| `status` | Xem trạng thái container và mức dùng bộ nhớ |
| `logs` | Xem log trực tiếp (Ctrl+C để thoát) |
| `start`, `stop`, `restart` | Bật, tắt, khởi động lại |
| `down` | Dừng và gỡ container, dữ liệu vẫn còn |
| `shell` | Mở shell bên trong container |
| `create-admin [email]` | Tạo hoặc đặt lại mật khẩu tài khoản quản trị |
| `create-demo [email]` | Tạo hoặc đặt lại tài khoản Demo chỉ xem (mặc định `demo@mail.com`) |
| `backup` | Sao lưu và chép ra thư mục `backups-<ngày giờ>` |
| `reset` | Xóa container **và toàn bộ dữ liệu** (phải gõ `XOA` để xác nhận) |

Xem danh sách lệnh bất cứ lúc nào bằng `scripts/webmantle.sh help`.

## Cấu hình

Mọi thiết lập nằm trong `.env` (không bao giờ commit lên git). Những biến hay dùng:

| Biến | Ý nghĩa |
| --- | --- |
| `SITE_URL` | Địa chỉ công khai của website, dùng cho liên kết, sitemap và RSS |
| `PREVIEW_SECRET` | Khóa bí mật cho liên kết xem trước (CLI tự sinh) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Quản trị viên đầu tiên, chỉ dùng ở lần khởi động đầu |
| `WEB_PORT` | Cổng mở ra máy chủ, mặc định `3000` |
| `WEB_MEMORY` | Giới hạn bộ nhớ của container, mặc định `1g` |
| `TRUST_PROXY` | Đặt `true` chỉ khi có reverse proxy do bạn kiểm soát đứng trước |
| `DEMO_PUBLIC_LOGIN` | `true` để bật nút `/demo` tự đăng nhập tài khoản Demo |

Sau khi sửa `.env`, chạy `scripts/webmantle.sh restart`. Riêng `WEB_PORT` và `WEB_MEMORY` cần `scripts/webmantle.sh up` để áp dụng.

## Tài khoản

Tạo quản trị viên mới (CLI hỏi mật khẩu, không hiển thị khi gõ):

```bash
scripts/webmantle.sh create-admin ban@ten-mien.com
```

Tạo tài khoản Demo chỉ xem, không thêm, sửa hay xóa được gì:

```bash
scripts/webmantle.sh create-demo demo@mail.com
```

Dùng cho script tự động, truyền mật khẩu qua biến môi trường `WM_PASSWORD` thay vì gõ tay:

```bash
WM_PASSWORD='mat-khau-dai-tu-12-ky-tu' scripts/webmantle.sh create-admin ban@ten-mien.com
```

Chạy lại lệnh với cùng email sẽ đặt lại mật khẩu của tài khoản đó.

## Dữ liệu và sao lưu

Cơ sở dữ liệu, ảnh tải lên, giao diện đã cài và bản sao lưu nằm trong volume Docker `webmantle-data`. Gỡ hay build lại container không làm mất dữ liệu.

```bash
scripts/webmantle.sh backup
```

Lệnh này tạo bản sao lưu nhất quán và chép ra thư mục `backups-<ngày giờ>` ngay trong dự án. Hãy cất bản sao ở nơi khác ngoài máy chủ. Cách khôi phục xem [docs/backup-and-restore.md](docs/backup-and-restore.md).

## Nâng cấp phiên bản

```bash
git pull
scripts/webmantle.sh backup
scripts/webmantle.sh update
```

Khi khởi động, container tự cập nhật cơ sở dữ liệu và các giao diện có sẵn.

## Đưa website ra mạng

- **Dùng tạm:** mở đường hầm, ví dụ `cloudflared tunnel --url http://localhost:3000`. Rồi đặt `SITE_URL` bằng địa chỉ HTTPS nhận được, đặt `TRUST_PROXY="true"` và chạy `scripts/webmantle.sh up`.
- **Dùng lâu dài:** chạy trên VPS và đặt Caddy hoặc nginx phía trước. Xem [docs/vi/deploy-docker.md](docs/vi/deploy-docker.md).

Trước khi mở ra mạng, hãy dùng mật khẩu quản trị dài và chỉ bật `DEMO_PUBLIC_LOGIN` trên site chỉ có dữ liệu mẫu.

## Xử lý sự cố

| Triệu chứng | Cách xử lý |
| --- | --- |
| `Docker chưa chạy` | Mở Docker Desktop rồi thử lại |
| Build lỗi `input/output error` hoặc hệ thống file chỉ đọc | Ổ đĩa đầy. Giải phóng dung lượng, rồi chạy `docker builder prune -f` |
| Cổng đã bị chiếm | Đổi `WEB_PORT` trong `.env` rồi chạy `scripts/webmantle.sh up` |
| Container tự khởi động lại | Xem `scripts/webmantle.sh logs`. Thường do thiếu `ADMIN_EMAIL`/`ADMIN_PASSWORD` hoặc mật khẩu dưới 12 ký tự ở lần đầu |
| Quên mật khẩu quản trị | `scripts/webmantle.sh create-admin <email>` để đặt lại |
| Website báo hết bộ nhớ | Tăng `WEB_MEMORY` (ví dụ `2g`) rồi chạy `up` |

## Tài liệu khác

- [Hosting trên cPanel](docs/vi/deploy-cpanel.md)
- [Hosting bằng Docker (chi tiết, reverse proxy)](docs/vi/deploy-docker.md)
- [Tạo bản phát hành](docs/vi/release.md)
