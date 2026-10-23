# Trung tâm Anh ngữ (mẫu)

Giao diện blog và giới thiệu khoá học cho trung tâm tiếng Anh. Toàn bộ nội dung (khoá học, học phí, giáo viên, cảm nhận, cơ sở) nằm trong `content.json`, nên bạn sửa được mà không đụng đến bố cục.

## Trang chủ có gì

1. Đầu trang có menu thả xuống: Giới thiệu, Khoá học, Học phí, Blog, Liên hệ.
2. Hero và các con số nổi bật (tắt được trong **Giao diện → Cài đặt**).
3. Danh sách khoá học: mỗi khoá có trình độ, thời lượng, lịch học, học phí.
4. Lợi thế của trung tâm.
5. Bảng học phí theo hình thức học: lớp nhóm, kèm 1-1, online.
6. Giáo viên.
7. Cảm nhận học viên và đối tác.
8. Ba bài viết mới nhất.
9. Các cơ sở.
10. Lời kêu gọi đăng ký và chân trang nhiều cột.

Trang bài viết có khối lời kêu gọi và ba bài liên quan. Trang tĩnh (giới thiệu, học phí, liên hệ) cũng có lời kêu gọi ở cuối.

## Sửa nội dung

Mở `content.json`. Các khối chính:

| Khối           | Dùng ở đâu            | Ghi chú                                            |
| -------------- | --------------------- | -------------------------------------------------- |
| `nav`          | Menu đầu trang        | `children` tạo menu thả xuống                      |
| `courses`      | Danh sách khoá học    | `badge` là nhãn góc thẻ, bỏ trống nếu không cần    |
| `features`     | Lợi thế               | Tiêu đề và một câu mô tả                           |
| `tuition`      | Bảng học phí          | `plans` là các gói; mỗi gói có `specs` (tối đa 12) |
| `teachers`     | Giáo viên             | Chữ cái đầu tên dùng làm ảnh đại diện              |
| `testimonials` | Cảm nhận              | Trích dẫn, tên, vai trò                            |
| `partners`     | Dải đối tác/chứng chỉ | Chỉ có tên; thay bằng tên thật                     |
| `stats`        | Con số nổi bật        | `value` là chuỗi, ví dụ `"12.000+"`                |
| `offices`      | Cơ sở                 | Thành phố, địa chỉ, điện thoại, email              |
| `cta`          | Lời kêu gọi           | Nút và đường dẫn                                   |
| `footer`       | Chân trang            | Các cột link, liên hệ, bản quyền                   |

Mục không hợp lệ sẽ bị bỏ qua, các mục khác vẫn hiện. Khi tải theme lên, lỗi sẽ được báo rõ.

Đường dẫn trong nội dung phải bắt đầu bằng `/` hoặc `https://`.

## Trang và chuyên mục cần có

Menu và chân trang trỏ đến các địa chỉ dưới đây. Nếu bạn cài bằng dữ liệu mẫu của dự án, các trang và chuyên mục này được tạo sẵn. Nếu không, hãy tạo đúng slug:

- Trang: `gioi-thieu`, `khoa-hoc`, `hoc-phi`, `lien-he` (đường dẫn `/pages/<slug>`)
- Chuyên mục: `ielts`, `ngu-phap`, `tu-vung`, `meo-hoc`, `tin-tuc` (đường dẫn `/categories/<slug>`)

## Quy cách bài viết để các bài đồng nhất

Giao diện đã tự đồng nhất thẻ bài: ảnh luôn 16:9, tiêu đề đủ hai dòng, đoạn trích đủ ba dòng và nút "Đọc tiếp" nằm đáy thẻ. Để nội dung cũng đồng nhất, nên viết mọi bài theo cùng một khuôn:

1. **Tiêu đề** dưới 70 ký tự, bắt đầu bằng chủ đề (ví dụ "IELTS Writing Task 2: ...").
2. **Đoạn trích** 120–160 ký tự, nói rõ bài viết giải quyết vấn đề gì.
3. **Ảnh đại diện** tỉ lệ 16:9 (ví dụ 1600 × 900). Giao diện sẽ cắt đều, nhưng ảnh đúng tỉ lệ thì đẹp nhất.
4. **Nội dung** theo thứ tự:
   - Mở bài: nêu vấn đề của người học.
   - Các mục bằng tiêu đề H2, mỗi mục một ý chính.
   - Kết luận: tóm tắt ba việc nên làm.
   - Lời kêu gọi nhẹ nhàng đến khoá học liên quan.
5. **Chuyên mục** chọn đúng một chuyên mục chính.
6. **Thẻ** (tag) dùng ba đến năm từ khoá.

## Cài đặt

- **Màu chủ đạo**: đổi màu nhấn của toàn bộ theme.
- **Hiện các con số nổi bật**: tắt để ẩn dải thống kê.

## Đóng gói

```sh
cd themes/english-center && zip -r ../../dist/english-center-1.0.0.zip . -x "*.DS_Store"
```
