# Webmantle

[English](README.en.md) | **Tiếng Việt**

Webmantle là hệ thống quản trị nội dung (CMS) cho blog và website, viết bằng Next.js (App Router), React, TypeScript, Tailwind CSS, SQLite và Prisma.

Tính năng chính là Theme Engine: quản trị viên tải lên file ZIP giao diện, kiểm tra, xem trước, kích hoạt và quay lại bản cũ, mà không đụng tới bài viết, trang, chuyên mục, người dùng hay dữ liệu SEO.

## Giấy phép và đóng góp

Mã nguồn: https://github.com/phungbach/webmantle

Bản quyền © 2026 PhungBach. Mã nguồn dùng giấy phép [MIT](LICENSE): anh em được dùng, sửa và phát hành lại, kể cả cho dự án thương mại. Phát hiện lỗi hoặc muốn đề xuất, hãy mở một Issue hoặc Pull Request trên GitHub.

## Mục lục

- [Chạy thử nhanh](#chạy-thử-nhanh)
- [Build và chạy bằng Docker (CLI)](#build-và-chạy-bằng-docker-cli)
- [Hosting](#hosting)
- [Các lệnh npm](#các-lệnh-npm)
- [Tài liệu](#tài-liệu)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Ngôn ngữ](#ngôn-ngữ)
- [Tình trạng](#tình-trạng)

## Chạy thử nhanh

```sh
npm install
cp .env.example .env          # rồi sửa ADMIN_EMAIL, ADMIN_PASSWORD (từ 12 ký tự), PREVIEW_SECRET
npx prisma migrate deploy     # tạo data/cms.db
npm run db:seed               # tạo quản trị viên, cài các giao diện có sẵn, thêm một bài mẫu
npm run dev                   # http://localhost:3000  ->  trang quản trị ở /admin
```

Chạy thật trên máy chủ: xem [Hosting](#hosting) bên dưới.

## Build và chạy bằng Docker (CLI)

Dự án có công cụ dòng lệnh `scripts/webmantle.sh` để build và quản lý website trên Docker.

### Yêu cầu

- Docker Desktop (hoặc Docker Engine 24 trở lên có plugin Compose). Kiểm tra: `docker compose version`.
- Còn trống ít nhất 4 GB đĩa và khoảng 2 GB bộ nhớ để build lần đầu. Khi chạy, container giới hạn 1 GB.
- macOS, Linux, hoặc Windows với WSL2. Image là image Linux, nên Docker trên Windows phải chạy container Linux.

### Bắt đầu trong 3 bước

```bash
git clone https://github.com/TÀI-KHOẢN/webmantle.git
cd webmantle
```

**1. Tạo file cấu hình.** CLI hỏi địa chỉ website, email và mật khẩu quản trị (từ 12 ký tự), và tự sinh khóa bí mật:

```bash
scripts/webmantle.sh init
```

**2. Build và chạy.** Lần đầu mất vài phút. Khi xong, CLI in `Sẵn sàng: http://localhost:3000`:

```bash
scripts/webmantle.sh up
```

**3. Đăng nhập** tại `http://localhost:3000/login` bằng email và mật khẩu đã nhập ở bước 1.

Bạn cũng gọi được qua npm: `npm run docker -- up`.

### Các lệnh

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

### Cấu hình

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

### Tài khoản

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

### Dữ liệu, sao lưu và nâng cấp

Cơ sở dữ liệu, ảnh tải lên, giao diện đã cài và bản sao lưu nằm trong volume Docker `webmantle-data`. Gỡ hay build lại container không làm mất dữ liệu.

```bash
scripts/webmantle.sh backup
```

Lệnh này tạo bản sao lưu nhất quán và chép ra thư mục `backups-<ngày giờ>` ngay trong dự án. Hãy cất bản sao ở nơi khác ngoài máy chủ. Cách khôi phục xem [docs/backup-and-restore.md](docs/backup-and-restore.md).

Nâng cấp phiên bản:

```bash
git pull
scripts/webmantle.sh backup
scripts/webmantle.sh update
```

Khi khởi động, container tự cập nhật cơ sở dữ liệu và các giao diện có sẵn.

### Đưa website ra mạng

- **Dùng tạm:** mở đường hầm, ví dụ `cloudflared tunnel --url http://localhost:3000`. Rồi đặt `SITE_URL` bằng địa chỉ HTTPS nhận được, đặt `TRUST_PROXY="true"` và chạy `scripts/webmantle.sh up`.
- **Dùng lâu dài:** chạy trên VPS Linux và đặt Caddy hoặc nginx phía trước. Xem [docs/vi/deploy-docker.md](docs/vi/deploy-docker.md).

Trước khi mở ra mạng, hãy dùng mật khẩu quản trị dài và chỉ bật `DEMO_PUBLIC_LOGIN` trên site chỉ có dữ liệu mẫu.

### Xử lý sự cố Docker

| Triệu chứng | Cách xử lý |
| --- | --- |
| `Docker chưa chạy` | Mở Docker Desktop rồi thử lại |
| Build lỗi `input/output error` hoặc hệ thống file chỉ đọc | Ổ đĩa đầy. Giải phóng dung lượng, rồi chạy `docker builder prune -f` |
| Cổng đã bị chiếm | Đổi `WEB_PORT` trong `.env` rồi chạy `scripts/webmantle.sh up` |
| Container tự khởi động lại | Xem `scripts/webmantle.sh logs`. Thường do thiếu `ADMIN_EMAIL`/`ADMIN_PASSWORD` hoặc mật khẩu dưới 12 ký tự ở lần đầu |
| Quên mật khẩu quản trị | `scripts/webmantle.sh create-admin <email>` để đặt lại |
| Website báo hết bộ nhớ | Tăng `WEB_MEMORY` (ví dụ `2g`) rồi chạy `up` |
| Ổ đĩa đầy vì Docker | Chạy `docker builder prune -f` để xóa cache build |

## Hosting

| Nơi chạy | Hướng dẫn (tiếng Việt) | Bản tiếng Anh |
| --- | --- | --- |
| cPanel (Setup Node.js App) | [docs/vi/deploy-cpanel.md](docs/vi/deploy-cpanel.md) | [docs/deploy-cpanel.md](docs/deploy-cpanel.md) |
| Docker / Docker Compose | [docs/vi/deploy-docker.md](docs/vi/deploy-docker.md) | [docs/deploy-docker.md](docs/deploy-docker.md) |
| Tạo gói phát hành, đưa lên GitHub | [docs/vi/release.md](docs/vi/release.md) | [docs/release.md](docs/release.md) |

`npm run release` tạo gói build sẵn trong `release/` (`webmantle-vX.Y.Z.zip`), không chứa `.env`, cơ sở dữ liệu hay ảnh tải lên. Trên máy chủ: `npm ci`, `npx prisma migrate deploy`, `npm run db:seed`, rồi `npm start` (hoặc `app.js` trên cPanel). Với Docker: dùng CLI ở phần trên, hoặc `cp .env.example .env`, sửa file, rồi `docker compose up -d --build`.

Các bài hướng dẫn có video (tiếng Việt và tiếng Anh) cũng nằm trong mục Hướng dẫn của chính website: `/pages/huong-dan-cpanel` và `/pages/huong-dan-docker`.

## Các lệnh npm

| Lệnh | Việc làm |
| --- | --- |
| `npm run dev` | Chạy máy chủ phát triển |
| `npm run build` | Tạo Prisma client và build bản chạy thật |
| `npm start` | Chạy bản build |
| `npm run db:migrate` | Áp dụng các bản cập nhật cơ sở dữ liệu (dùng trên máy chủ) |
| `npm run db:migrate:dev` | Tạo và áp dụng một bản cập nhật mới (khi phát triển) |
| `npm run db:seed` | Cài đặt lặp lại an toàn: quản trị viên, giao diện có sẵn, bài mẫu |
| `npm run db:backup` | Sao lưu nhất quán cơ sở dữ liệu, ảnh và giao diện |
| `npm run docker -- <lệnh>` | Công cụ Docker `scripts/webmantle.sh` |
| `npm run release` | Kiểm tra, build và đóng gói bản phát hành |
| `npm run typecheck` | TypeScript, chế độ strict |
| `npm run lint` | ESLint (quy tắc Next.js) |
| `npm test` | Test đơn vị, tích hợp, hiển thị và thành phần (Vitest, React Testing Library). Các route handler được gọi trực tiếp, không cần máy chủ HTTP. |
| `npm run test:e2e` | Test trên trình duyệt (Playwright, Chromium) ở cổng 3201 với cơ sở dữ liệu riêng |
| `npm run format:check` | Kiểm tra Prettier |

## Tài liệu

Các tài liệu kỹ thuật bên dưới viết bằng tiếng Anh.

- [Kiến trúc](docs/architecture.md): các module, mô hình dữ liệu, luồng xử lý yêu cầu, và vì sao website công khai được render phía máy chủ.
- [Phát triển giao diện](docs/theme-development.md): hợp đồng giao diện, các trường manifest, template, component, thiết lập và đóng gói.
- [Bảo mật](docs/security.md): mô hình đe dọa, các biện pháp và giới hạn đã biết.
- [Triển khai](docs/deployment.md): VPS Linux, trình quản lý tiến trình, reverse proxy, biến môi trường.
- [Plugin](docs/plugins.md): cách plugin hoạt động, các điểm móc và cách viết một plugin.
- [Giao diện và màu sắc](docs/appearance.md): bộ màu, màu tiêu đề, hiệu ứng theo mùa, logo và favicon.
- [SEO](docs/seo.md): các trường SEO, kiểm tra, sitemap và robots.
- [Sao lưu và khôi phục](docs/backup-and-restore.md): sao lưu, khôi phục và cứu hộ khi đổi giao diện bị lỗi.
- Hosting: [cPanel](docs/vi/deploy-cpanel.md), [Docker](docs/vi/deploy-docker.md) và [phát hành](docs/vi/release.md) (tiếng Việt).

## Cấu trúc dự án

```
src/app/           route: trang công khai, /admin, /login, /preview, feed, tài nguyên giao diện, API
src/components/    component giao diện (do lõi quản lý) và giao diện quản trị
src/lib/           xác thực, nội dung, media, theme engine, kiểm tra dữ liệu, SEO, bảo mật
themes/            giao diện có sẵn: webcore (mặc định và dự phòng), hien-studio, english-center
tests/fixtures/    hai giao diện mẫu default (Editorial) và starter (Midnight Grid), chỉ dùng cho test
prisma/            schema, migration, seed
scripts/           sao lưu, chuẩn bị e2e, đóng gói, CLI Docker
tests/             test đơn vị, tích hợp, hiển thị và e2e
data/              dữ liệu chạy: cms.db, themes/, media/, backups/ (không công khai, bị git bỏ qua)
legacy-static/     bản mẫu tĩnh ban đầu, chỉ giữ để tham khảo
```

## Ngôn ngữ

Mặc định là tiếng Việt. Khách và quản trị viên chuyển sang tiếng Anh từ thanh đầu trang hoặc thanh bên. Xem [docs/architecture.md](docs/architecture.md#languages).

## Tình trạng

Đã có: quản lý nội dung (bài viết, trang, chuyên mục, thẻ, phiên bản, hẹn giờ, bài nổi bật), tải ảnh lên có kiểm tra nội dung, người dùng và vai trò, nhật ký hoạt động, cài đặt website, theme engine (tải lên, kiểm tra, xem trước, kích hoạt, quay lại, cập nhật có sao lưu, chặn gỡ nhầm, thiết lập riêng cho từng giao diện, lịch sử), website công khai (trang chủ, bài viết, lưu trữ, tìm kiếm, trang, tác giả, 404, RSS, sitemap, robots, Open Graph, JSON-LD), script sao lưu, CLI Docker, bản phát hành cho cPanel và Docker, và bộ test.

Chưa có, do chủ ý hoặc chưa kịp: trình soạn thảo WYSIWYG (nội dung là HTML trong ô văn bản, được làm sạch khi lưu), thay đổi kích thước ảnh và biến thể responsive, thông báo toast và khung chờ, và giới hạn tốc độ phân tán. Xem [docs/architecture.md](docs/architecture.md#known-gaps).
