# Tạo bản phát hành

## Các gói được tạo ra

`npm run release` kiểm tra mã (typecheck và test), build website rồi ghi các file sau vào `release/`:

| File                          | Công dụng                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webmantle-vX.Y.Z.zip`        | Gói **build sẵn** để đưa lên hosting. Chứa website đã build, mã nguồn cần để khởi động, tài liệu, `app.js` (cPanel), `Dockerfile` và `docker-compose.yml`. Không có `.env`, cơ sở dữ liệu hay ảnh tải lên. |
| `webmantle-vX.Y.Z-source.zip` | Mã nguồn đúng như đã commit trong git (chỉ tạo khi chạy trong một repo git).                                                                                                 |
| `*.sha256`                    | Mã kiểm tra toàn vẹn.                                                                                                                                                        |

Gói build sẵn dùng được trên nhiều hệ điều hành: nó không chứa `node_modules`, nên `npm ci` trên hosting sẽ cài các phần native (Prisma engine và `sharp`) đúng cho hệ thống của hosting.

Script sẽ dừng nếu tìm thấy `.env`, cơ sở dữ liệu hoặc file khóa bên trong gói.

Hãy chạy trên một bản checkout sạch. Cần `node` 20.9+, `npm`, `rsync` và `zip` (macOS và Linux có sẵn; trên Windows dùng WSL hoặc Git Bash).

## Phát hành một phiên bản

1. Cập nhật `CHANGELOG.md` và `version` trong `package.json` (cùng `package-lock.json`).
2. Chạy `npm run release`, rồi thử gói build sẵn trong một thư mục trống: `npm ci`, `npx prisma migrate deploy`, `npm run db:seed`, `npm start`.
3. Commit, rồi gắn tag và đẩy lên:

```bash
git tag -a v1.0.0 -m "Webmantle 1.0.0"
git push origin main --tags
```

Với workflow GitHub kèm theo (`.github/workflows/release.yml`), đẩy một tag dạng `v*` sẽ build các gói trên GitHub và đính kèm vào một GitHub Release.

## Chỉ đưa file build lên GitHub

Nếu bạn không muốn đẩy mã nguồn, chỉ cần đính kèm file zip vào Release:

1. Tạo một commit bất kỳ trong repo (ví dụ thêm `README.md` ngay trên giao diện web), vì repo trống thì chưa tạo được Release.
2. Mở `https://github.com/TÀI-KHOẢN/webmantle/releases/new`, tạo tag `v1.0.0`.
3. Kéo `webmantle-v1.0.0.zip` và `webmantle-v1.0.0.zip.sha256` vào ô đính kèm, rồi bấm Publish release.

Hoặc dùng GitHub CLI:

```bash
gh release create v1.0.0 release/webmantle-v1.0.0.zip release/webmantle-v1.0.0.zip.sha256 --repo TÀI-KHOẢN/webmantle --title "Webmantle 1.0.0"
```

## Đưa mã nguồn lên GitHub

Repo không bao giờ được chứa `.env`. File `.gitignore` đã loại trừ `.env`, `.env.*` (trừ `.env.example`), toàn bộ thư mục `data/`, `node_modules` và `release/`.

```bash
git init -b main              # chỉ làm một lần
git add .
git status                    # kiểm tra không có file .env hay data/ trong danh sách
git commit -m "Webmantle 1.0.0"
git remote add origin https://github.com/TÀI-KHOẢN/webmantle.git
git push -u origin main --tags
```

Hoặc với GitHub CLI: `scripts/publish-github.sh TÀI-KHOẢN/webmantle private`.

Nếu token của bạn không có quyền **Workflows**, GitHub sẽ từ chối việc đẩy các file trong `.github/workflows/`. Hãy thêm quyền này cho token, hoặc đăng nhập bằng `gh auth login` qua trình duyệt.
