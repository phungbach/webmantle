# Webmantle (mặc định)

Giao diện mặc định đi kèm Webmantle. Có sẵn:

- **Trang chủ** giới thiệu Webmantle: hero, dải số liệu, tính năng, bốn bước bắt đầu và lối vào hướng dẫn.
- **Trang Giới thiệu** và **bộ hướng dẫn sử dụng** (một trang mục lục và chín trang chi tiết) có ảnh chụp màn hình trang quản trị.
- Các trang bài viết, chuyên mục, tìm kiếm và 404 dùng chung một bảng màu chàm.

## Sửa nội dung

- Chữ, liên kết và ảnh của trang chủ nằm trong `content.json`, và sửa được trực tiếp trong **Thiết kế trang chủ** của trang quản trị.
- Các trang giới thiệu và hướng dẫn nằm trong `pages.json`. Khi cài, chúng thành các Trang thật trong mục **Trang**, bạn sửa như mọi trang khác. Ảnh chụp màn hình ở `assets/guide-*.jpg`.
- Màu và font ở `theme.json`. Màu nhấn đổi được trong **Giao diện → Cài đặt**.

## Đóng gói

```sh
cd themes/webcore && zip -r ../../dist/webcore-1.0.0.zip . -x "*.DS_Store"
```
