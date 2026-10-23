# Theme mẫu của tôi

Theme mẫu để bắt đầu phát triển theme riêng. Đây là một thư mục thuần dữ liệu: không có mã JavaScript, không có HTML.

## Cấu trúc

```
theme.json              khai báo theme: id, tên, màu, font, cài đặt (bắt buộc)
styles.css              kiểu dáng (bắt buộc)
templates/              bố cục từng loại trang, dạng JSON (bắt buộc: home, single-post, archive, page, search, not-found)
templates/category.json tùy chọn, nếu thiếu sẽ dùng archive.json
assets/                 tùy chọn: ảnh .png .jpg .webp .gif hoặc font .woff2
README.md               mô tả theme này
```

Chỉ các tệp trên được chấp nhận. Tệp ẩn, liên kết tượng trưng, script, SVG và HTML sẽ bị từ chối.

## Bắt đầu

1. Sao chép thư mục này và đổi tên, ví dụ `my-blog-theme`.
2. Trong `theme.json`, đổi `id` (chỉ chữ thường, số và dấu gạch ngang), `name`, `version` và `author`.
3. Sửa màu trong `tokens` và `styles.css`.
4. Đóng gói. Chạy lệnh này **bên trong** thư mục theme, không zip thư mục cha:

   ```sh
   cd my-blog-theme && zip -r ../my-blog-theme-1.0.0.zip . -x "*.DS_Store"
   ```

5. Trong **Admin → Giao diện → Tải lên**, chọn tệp ZIP. Sau đó kiểm tra kết quả và xem trước trước khi kích hoạt.

Mỗi lần đổi, tăng `version` trong `theme.json` để khi tải lên không bị từ chối vì trùng phiên bản.

## Bố cục (templates/*.json)

Mỗi tệp là một cây component, bắt đầu bằng `Shell`. Ví dụ:

```json
{
  "contractVersion": 1,
  "root": {
    "component": "Shell",
    "children": [
      { "component": "SiteHeader", "props": { "variant": "simple" } },
      {
        "component": "Section",
        "props": { "width": "content" },
        "children": [{ "component": "PostList", "props": { "layout": "grid", "limit": 6 } }]
      },
      { "component": "SiteFooter", "props": { "variant": "simple" } }
    ]
  }
}
```

Các component có sẵn và prop chính:

| Component                        | Prop chính                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| `Shell`                          | không có. Đặt ở gốc của mọi template.                                      |
| `Section`                        | `width`: narrow, content, wide, full                                       |
| `Grid`, `Stack`                  | `columns` 1–4 (Grid), `gap` sm, md, lg                                     |
| `SiteHeader`                     | `variant`: simple, centered, split, mega (mega cần `content.json`)         |
| `SiteFooter`                     | `variant`: simple, columns                                                 |
| `Breadcrumbs`                    | không có. Tự ẩn ở trang chủ và 404.                                        |
| `Hero`                           | `eyebrow`, `showDescription`                                               |
| `PostList`                       | `layout`: list, grid, compact; `limit` 1–24; `showExcerpt`; `skipFeatured` |
| `PostDetail`                     | `showFeaturedImage`                                                        |
| `RelatedPosts`                   | `limit` 1–12                                                               |
| `PageBody`                       | không có. Nội dung trang tĩnh.                                             |
| `ArchiveHeader`                  | `showCount`                                                                |
| `Pagination`                     | không có                                                                   |
| `SearchForm`                     | `placeholder`                                                              |
| `EmptyState`                     | `message`                                                                  |
| `CategoryList`, `TagList`        | `limit`                                                                    |

Component nhận dữ liệu từ CMS. Theme không truy vấn cơ sở dữ liệu.

## Class CSS có sẵn

Các class được sinh ra bởi component, để bạn viết `styles.css`:

- Khung: `.cms-theme-root`, `.cms-shell`, `.cms-section`, `.cms-section--<width>`
- Đầu và chân trang: `.cms-header`, `.cms-header__brand`, `.cms-header__nav`, `.cms-footer`
- Danh sách: `.cms-post-list`, `.cms-post-list--<layout>`, `.cms-post`, `.cms-post__title`, `.cms-post__meta`, `.cms-post__excerpt`, `.cms-post__image`, `.cms-post__more`
- Bài viết đơn: `.cms-article`, `.cms-article__header`, `.cms-article__title`, `.cms-article__meta`, `.cms-article__image`, `.cms-article__body`
- Khác: `.cms-pagination`, `.cms-search`, `.cms-empty`, `.cms-archive-header`, `.cms-chips`

## Biến CSS

Các token trong `theme.json` thành biến CSS trên `.cms-theme-root`:

- `--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-accent`, `--color-border`
- `--font-body`, `--font-heading`, `--measure`

Một cài đặt có `cssVariable` (ở đây là `accentColor` → `--color-accent`) sẽ ghi đè token đó khi người quản trị đổi giá trị.

## Cài đặt (settingsSchema)

Các cài đặt hiện trong **Admin → Giao diện** khi theme được chọn. Cài đặt kiểu boolean hoặc select cũng được ghi thành thuộc tính trên gốc theme, dạng `data-setting-<tên-kebab>`. Ví dụ `showExcerpts` thành `data-setting-show-excerpts="false"`. Dùng selector thuộc tính trong `styles.css` để đổi kiểu theo cài đặt, như trong file này.

## Kiểm tra trước khi tải lên

- Tải lên trong Admin → Giao diện. Danh sách lỗi sẽ chỉ rõ tệp và quy tắc bị vi phạm.
- Xem trước bằng nút **Xem thử**, cả trên máy tính và điện thoại, trước khi kích hoạt.
- Thử các trang: trang chủ, bài viết, chuyên mục, trang tĩnh, tìm kiếm và 404.

## Không được dùng

- `@import`, `url()` tới địa chỉ ngoài, `expression()`, `javascript:` trong CSS.
- Dấu ngoặc nhọn `{}`, dấu chấm phẩy và dấu `;` bên trong giá trị CSS của cài đặt.
- Tệp ngoài danh sách cho phép.

## Page designer blocks

The core ships ten content blocks that the page designer uses and that templates may use too:
`Heading`, `RichText`, `Image`, `Button`, `Spacer`, `Divider`, `Gallery`, `BannerHero`, `CardsGrid`
and `CtaBlock`. Unlike the marketing blocks they hold their content in `props` instead of
`content.json`, and images are referenced by media id. Their baseline styling uses the
single-class `.cms-b-*` selectors (for example `.cms-b-button--primary`, `.cms-b-banner--dark`,
`.cms-b-cards__item`) and the theme tokens (`--color-accent`, `--color-text`, `--color-surface`,
`--color-border`, `--font-heading`), so a theme can restyle them from its own `styles.css` without
extra specificity. Nothing is required: a theme that ignores them still gets a sensible look.
