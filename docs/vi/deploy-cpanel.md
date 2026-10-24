# Triển khai Webmantle trên cPanel

Webmantle chạy trên cPanel như một **ứng dụng Node.js** (công cụ "Setup Node.js App", dùng CloudLinux và Passenger). Cả website là một tiến trình Node với cơ sở dữ liệu SQLite nằm trong một file, nên **không cần tạo MySQL**.

> Không phải gói cPanel nào cũng có "Setup Node.js App". Nếu không thấy mục này, hãy nhờ nhà cung cấp hosting bật, hoặc dùng VPS với Docker ([deploy-docker.md](deploy-docker.md)).

## Cần chuẩn bị

- cPanel có **Setup Node.js App**, Node.js **20.9 trở lên** (chọn 22 nếu có).
- Quyền dùng Terminal (cPanel **Terminal** hoặc SSH). Không có Terminal thì không chạy được lệnh tạo bảng dữ liệu.
- Khoảng 1 GB dung lượng đĩa và 1 GB bộ nhớ khi cài đặt. Gói build sẵn bỏ qua bước `next build`, là bước hay hết bộ nhớ trên shared hosting.
- Một tên miền hoặc tên miền phụ đã trỏ về tài khoản, có chứng chỉ SSL (AutoSSL là đủ).

## Bước 1. Lấy gói cài đặt

Tải `webmantle-v1.0.0.zip` ở trang GitHub Releases của dự án. Đây là gói **build sẵn**: website đã được build, và gói không chứa `.env`, cơ sở dữ liệu hay ảnh tải lên.

Muốn tự build, chạy `npm run release` trên máy của bạn (xem [release.md](release.md)). Lệnh này tạo cùng file zip trong thư mục `release/`.

## Bước 2. Tải lên và giải nén

1. Trong **File Manager**, tạo một thư mục cho ứng dụng **bên ngoài** `public_html`, ví dụ `/home/USER/webmantle`.
2. Tải file zip lên thư mục đó rồi bấm **Extract**. Chuyển các file ra khỏi thư mục con `webmantle-v1.0.0` để `package.json` và `app.js` nằm ngay trong `/home/USER/webmantle`.
3. Tạo thêm một thư mục riêng cho dữ liệu, ví dụ `/home/USER/webmantle-data`. Cơ sở dữ liệu, ảnh tải lên, giao diện đã cài và bản sao lưu nằm ở đây, nên nâng cấp ứng dụng không làm mất chúng.

## Bước 3. Tạo ứng dụng Node.js

Mở **Setup Node.js App → Create Application** và điền:

| Trường                   | Giá trị                                |
| ------------------------ | -------------------------------------- |
| Node.js version          | 22 (hoặc bản 20.9+ mới nhất)           |
| Application mode         | Production                             |
| Application root         | `webmantle` (thư mục ở bước 2)         |
| Application URL          | tên miền hoặc tên miền phụ của bạn     |
| Application startup file | `app.js`                               |

Bấm **Create**. Đừng tải thư mục `node_modules` lên: cPanel tự quản lý thư mục này.

## Bước 4. Tạo file cấu hình

Tạo file tên `.env` trong thư mục gốc của ứng dụng (File Manager → New File → `.env`, rồi Edit). Sao chép nội dung từ `.env.example` và điền như sau:

```
DATABASE_URL="file:/home/USER/webmantle-data/cms.db"
CMS_DATA_DIR="/home/USER/webmantle-data"
SITE_URL="https://ten-mien-cua-ban.com"
PREVIEW_SECRET="<chuỗi ngẫu nhiên dài, từ 32 ký tự>"
ADMIN_EMAIL="ban@ten-mien-cua-ban.com"
ADMIN_PASSWORD="<từ 12 ký tự>"
ADMIN_NAME="Quản trị viên"
TRUST_PROXY="true"
```

- Tạo `PREVIEW_SECRET` trong Terminal bằng lệnh `openssl rand -base64 48`.
- `ADMIN_EMAIL` và `ADMIN_PASSWORD` chỉ dùng một lần, để tạo tài khoản quản trị đầu tiên. Sau đó bạn có thể xóa dòng `ADMIN_PASSWORD` khỏi file.
- Đặt `TRUST_PROXY="true"` vì cPanel có một proxy đứng trước ứng dụng. Nhờ vậy giới hạn đăng nhập tính theo địa chỉ thật của khách.
- Giữ file này riêng tư: đặt quyền `600` (File Manager → Permissions). Không đưa nó lên git và không gửi cho ai.

(Biến môi trường nhập trong màn hình Node.js App cũng dùng được, nhưng Terminal không thấy chúng, nên các lệnh tạo bảng dữ liệu bên dưới sẽ không đọc được. File `.env` thì cả hai nơi đều đọc được.)

## Bước 5. Cài thư viện và chuẩn bị cơ sở dữ liệu

Trong **Setup Node.js App**, mở ứng dụng và bấm **Run NPM Install**. Hoặc dùng Terminal: chép dòng lệnh ở đầu màn hình ứng dụng (bắt đầu bằng `source /home/USER/nodevenv/...`), chạy nó, rồi chạy tiếp:

```bash
cd ~/webmantle
npm ci
npx prisma migrate deploy
npm run db:seed
```

- `npm ci` cài đúng các phiên bản trong `package-lock.json` (đồng thời tạo Prisma client cho máy chủ).
- `npx prisma migrate deploy` tạo các bảng trong cơ sở dữ liệu.
- `npm run db:seed` tạo quản trị viên đầu tiên và cài các giao diện có sẵn. Chạy lại nhiều lần vẫn an toàn.

## Bước 6. Khởi động

Bấm **Restart** ở màn hình Node.js App rồi mở tên miền của bạn. Trang công khai ở `/`, trang quản trị ở `/admin` (đăng nhập bằng email và mật khẩu trong `.env`).

Kiểm tra ba điều:

1. `https://ten-mien-cua-ban.com/login` mở được.
2. Đăng nhập được và thấy Dashboard.
3. **Settings → General** hiện đúng địa chỉ website.

## Nâng cấp phiên bản

1. Sao lưu trước (xem bên dưới).
2. Tải file zip mới lên và giải nén đè vào thư mục ứng dụng. **Giữ nguyên** `.env` và thư mục dữ liệu (file zip không chứa chúng nên giải nén đè là an toàn).
3. Trong Terminal chạy: `npm ci`, `npx prisma migrate deploy`, `npm run db:seed`.
4. **Restart** ứng dụng.

## Sao lưu

```bash
cd ~/webmantle
npm run db:backup
```

Lệnh này ghi một bản sao nhất quán của cơ sở dữ liệu, ảnh và giao diện vào `webmantle-data/backups`. Bạn nên thêm nó vào **Cron Job** (ví dụ chạy mỗi ngày lúc 03:00) và thỉnh thoảng chép các bản sao lưu ra khỏi máy chủ. Xem [backup-and-restore.md](backup-and-restore.md).

## Tự build trên máy chủ (không bắt buộc)

Nếu muốn build ngay trên hosting: tải gói **mã nguồn** (`webmantle-v1.0.0-source.zip`) hoặc clone repo, chạy `npm ci && npm run build`, rồi làm tiếp từ bước 5. Việc build cần khoảng 1,5 GB bộ nhớ. Nếu tiến trình bị dừng giữa chừng, hãy dùng gói build sẵn.

## Xử lý sự cố

| Triệu chứng                                              | Nguyên nhân thường gặp và cách sửa                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| "Incomplete response" hoặc trang lỗi Passenger           | Mở `stderr.log` trong thư mục ứng dụng (hoặc **Setup Node.js App → Open log**). Thường do thiếu giá trị trong `.env` hoặc chưa chạy `npm ci`. |
| Lỗi nhắc tới `@prisma/client` hoặc query engine          | Chạy lại `npm ci` trong môi trường ảo của ứng dụng; kiểm tra phiên bản Node.js trùng với phiên bản đã chọn trong ứng dụng.                  |
| `Error: Could not find a production build`               | Thiếu thư mục `.next`. Dùng gói build sẵn, hoặc chạy `npm run build`.                                                                      |
| "Unable to open the database file"                       | `DATABASE_URL` trỏ tới thư mục không tồn tại hoặc không ghi được. Tạo thư mục và kiểm tra quyền.                                           |
| Mọi người dùng chung một giới hạn đăng nhập              | `TRUST_PROXY` chưa là `true`, nên mọi khách trông như cùng một địa chỉ.                                                                    |
| Hết bộ nhớ khi chạy `npm ci` hoặc khi build              | Dùng gói build sẵn; nhờ nhà cung cấp tăng giới hạn bộ nhớ.                                                                                 |
| Ảnh không hiện sau khi nâng cấp                          | `CMS_DATA_DIR` đã bị đổi. Giá trị này phải giữ nguyên giữa các lần nâng cấp.                                                               |
