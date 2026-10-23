# Hiên Studio (nội thất)

Giao diện landing cho studio thiết kế nội thất và kiến trúc, thiết kế trong Figma rồi dựng bằng các thành phần có sẵn của Webcore.

Thiết kế Figma: https://www.figma.com/design/beZBPwLJ3YB9VIawoyJmH8

## Trang chủ có gì

1. Hero: ảnh công trình có bản vẽ mặt bằng đặt lên trên (`assets/hero.jpg`).
2. Dải số liệu tối, toàn chiều ngang (tắt được trong **Giao diện → Cài đặt**).
3. Công trình gần đây: lấy từ các bài viết có thẻ `congtrinh` (loại, diện tích, thời gian, chi phí nhập ở ô "Thông tin dự án" của bài). Khi chưa có bài nào mang thẻ này, trang dùng khối `courses` trong `content.json`.
4. Quy trình bốn bước (khối `features`, số thứ tự do CSS tạo).
5. Báo giá theo m² (khối `pricing`, gói giữa nổi bật).
6. Đội ngũ, lời khen sau một năm, ba bài mới nhất, địa chỉ, lời kêu gọi.

## Sửa nội dung

Mọi chữ và giá nằm trong `content.json`. Ảnh công trình thay bằng file cùng tên trong `assets/` (jpg, 1200x900). Màu và font ở `theme.json`, font Bricolage Grotesque và Public Sans nằm trong `assets/`.

## Đóng gói

```sh
cd themes/hien-studio && zip -r ../../dist/hien-studio-1.0.0.zip . -x "*.DS_Store"
```

## Ảnh

Ảnh công trình lấy từ Unsplash (giấy phép Unsplash, dùng tự do, không bắt buộc ghi nguồn). Đây là ảnh minh hoạ, hãy thay bằng ảnh công trình của studio trước khi chạy thật.

## Các trang con

Các trang mà menu trỏ tới được tạo cùng theme (xem `pages.json`). Mỗi trang dùng một mẫu riêng của theme:

| Trang      | Đường dẫn           | Mẫu        | Khối trong `content.json`                  |
| ---------- | ------------------- | ---------- | ------------------------------------------ |
| Công trình | `/pages/cong-trinh` | `projects` | `heroprojects`, `projects`                 |
| Quy trình  | `/pages/quy-trinh`  | `process`  | `heroprocess`, `process`                   |
| Báo giá    | `/pages/bao-gia`    | `pricing`  | `heropricing`, `pricing`                   |
| Giới thiệu | `/pages/gioi-thieu` | `about`    | `heroabout`, `values`, `teachers`, `stats` |
| Liên hệ    | `/pages/lien-he`    | `contact`  | `herocontact`, `offices`                   |

Nội dung dưới phần chính (câu hỏi thường gặp, ghi chú giá) viết trong trình soạn trang ở admin.

Trang Liên hệ trong bản thiết kế Figma có biểu mẫu, nhưng theme không chứa mã nên bản này chỉ có địa chỉ, số điện thoại và nút gọi. Muốn có biểu mẫu cần thêm tính năng ở lõi CMS.

## Tiếng Anh

Theme chuyển được sang tiếng Anh bằng công tắc VI | EN ở đầu trang. Chữ tiếng Anh nằm trong `content.en.json` (các khối thay thế khối cùng tên trong `content.json`) và trong `translations.en` của từng trang ở `pages.json`. Tiêu đề các mục lấy từ khối `title...` nên cũng dịch được. Ảnh hero tiếng Anh là `assets/hero-en.jpg`.

Không dịch: tên site (Admin → Cài đặt), bài viết và trang do biên tập viên tự viết.

## Chuyên mục và bài viết

Theme mang theo 3 chuyên mục (`categories.json`), thẻ `congtrinh` (`tags.json`) và 12 bài mẫu (`posts.json`): 6 bài nhật ký và 6 bài công trình gắn thẻ `congtrinh`. Mỗi mục có bản tiếng Anh trong `translations.en`. Thêm một công trình mới: tạo bài viết, gắn thẻ `congtrinh`, điền "Thông tin dự án" và chọn ảnh đại diện; bài xuất hiện ở trang chủ (3 bài mới nhất) và ở trang Công trình. Cũng như trang tĩnh, chúng được tạo khi cài theme, hiện khi theme bật, ẩn khi chuyển sang theme khác và bị xoá khi gỡ theme.

## Trang blog

Nhật ký có đủ năm bố cục: danh sách tất cả bài (`/posts`), chuyên mục, bài viết, tìm kiếm và 404. Bài mẫu có ảnh (`image` trong `posts.json`), nhãn chuyên mục và thời gian đọc. Thiết kế nằm trong file Figma, trang "Blog · Hiên Studio".
