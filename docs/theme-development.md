# Theme development

A theme is a folder with a manifest, one stylesheet, JSON layouts, and optional images and fonts. It is packed into a ZIP and uploaded in **Admin → Themes**. It cannot contain code.

## Folder layout

```
my-theme/
  theme.json                 manifest (required)
  styles.css                 stylesheet (required)
  templates/
    home.json                required
    single-post.json         required
    archive.json             required
    page.json                required
    search.json              required
    not-found.json           required
    category.json            optional (falls back to archive.json)
  pages.json                 optional: static pages that come with the theme
  content.en.json            optional: the words of content.json in English
  categories.json            optional: categories that come with the theme
  tags.json                  optional: tags that come with the theme
  posts.json                 optional: posts that come with the theme
  assets/
    logo.png                 optional: .png .jpg .jpeg .webp .gif .woff2
  README.md                  recommended
```

Only the files above are accepted. Hidden files, symbolic links, scripts, SVG, HTML and anything else are rejected.

Start from `theme-template/` (a small starting point) or copy `themes/hien-studio`: change `id` and `name`, then pack it.

```sh
cd themes/my-theme && zip -r ../../dist/my-theme-1.0.0.zip . -x "*.DS_Store"
```

Do not zip the parent folder. `theme.json` must be at the root of the archive.

## theme.json

```json
{
  "contractVersion": 1,
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "description": "Shown in the theme manager.",
  "author": "Your name",
  "minimumCmsVersion": "1.0.0",
  "thumbnail": "assets/thumbnail.jpg",
  "supportedTemplates": [
    "home",
    "single-post",
    "archive",
    "category",
    "page",
    "search",
    "not-found"
  ],
  "requiredComponents": ["Shell", "SiteHeader", "SiteFooter", "PostList"],
  "tokens": {
    "color-bg": "#ffffff",
    "color-text": "#111111",
    "color-accent": "#2563eb",
    "font-body": "system-ui, sans-serif"
  },
  "settingsSchema": [
    {
      "key": "accentColor",
      "label": "Accent color",
      "type": "color",
      "default": "#2563eb",
      "cssVariable": "--color-accent"
    },
    { "key": "showExcerpts", "label": "Show excerpts", "type": "boolean", "default": true }
  ],
  "assets": ["assets/logo.png"]
}
```

| Field                | Rules                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | Lowercase letters, digits and single dashes, 2 to 40 characters. Unique on the site.                                                                                                                    |
| `version`            | `major.minor.patch`. A new version of the same id is an update and keeps a backup of the old one.                                                                                                       |
| `minimumCmsVersion`  | The CMS refuses themes that need a newer version.                                                                                                                                                       |
| `supportedTemplates` | Must include all required templates. Each listed template needs its file.                                                                                                                               |
| `requiredComponents` | Every name must exist in the component list below.                                                                                                                                                      |
| `tokens`             | Become CSS custom properties: `color-bg` becomes `--color-bg`. Values use a limited character set. No `url()`, `;`, `{` or `}`.                                                                         |
| `settingsSchema`     | Up to 30 settings. See below.                                                                                                                                                                           |
| `assets`             | Files that must exist under `assets/`.                                                                                                                                                                  |
| `thumbnail`          | Optional picture of the theme, shown in Admin → Themes: a `.png`, `.jpg` or `.webp` in `assets/`, up to 400 KB. 900 × 600 (3:2) fits the card without cropping. Without it the card shows a plain "Aa". |

### Settings

| type      | Value                           | How it reaches the page                                                    |
| --------- | ------------------------------- | -------------------------------------------------------------------------- |
| `color`   | `#rrggbb`                       | CSS variable named by `cssVariable`                                        |
| `text`    | up to `maxLength` (default 120) | CSS variable if `cssVariable` is set, otherwise available to the core only |
| `select`  | one of `options`                | `data-setting-<kebab-key>="<value>"` on the theme root                     |
| `boolean` | `true` or `false`               | `data-setting-<kebab-key>="true                                            | false"` on the theme root |

Example: the `showExcerpts` boolean becomes `data-setting-show-excerpts="false"` on `.cms-theme-root`. Style it with an attribute selector:

```css
.cms-theme-root[data-setting-show-excerpts="false"] .cms-post__excerpt {
  display: none;
}
```

Settings belong to one theme. Saving them for one theme never changes another theme's values.

## Templates

Each template is a tree of registry components:

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
        "children": [
          { "component": "PostList", "props": { "layout": "grid", "limit": 9 } },
          { "component": "Pagination" }
        ]
      },
      { "component": "SiteFooter" }
    ]
  }
}
```

Limits: up to 200 nodes, nesting up to 10 levels, up to 50 children per node. Unknown components, unknown props and wrong types fail validation.

### Components

| Component                 | Props                                                                      | Notes                                                    |
| ------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Shell`                   | none                                                                       | Outermost wrapper. Put it at the root of every template. |
| `Section`                 | `width`: narrow, content, wide, full; `tone`: plain, tint, dark, accent    | Page column and background band (full width)             |
| `Grid`                    | `columns` 1–4, `gap` sm, md, lg                                            | Wraps children in a grid                                 |
| `Stack`                   | `gap` sm, md, lg                                                           | Vertical spacing                                         |
| `SiteHeader`              | `variant`: simple, centered, split                                         | Site title and navigation                                |
| `SiteFooter`              | `variant`: simple, columns                                                 | Footer                                                   |
| `Breadcrumbs`             | none                                                                       | Hidden on the homepage and 404                           |
| `Hero`                    | `eyebrow`, `showDescription`                                               | Site title and description block                         |
| `FeaturedPost`            | `showExcerpt`                                                              | The post marked as featured                              |
| `PostList`                | `layout`: list, grid, compact; `limit` 1–24; `showExcerpt`; `skipFeatured` | Post cards                                               |
| `PostDetail`              | `showFeaturedImage`                                                        | Single post                                              |
| `RelatedPosts`            | `limit` 1–12                                                               | Posts sharing a category or tag                          |
| `PageBody`                | none                                                                       | Static page                                              |
| `ArchiveHeader`           | `showCount`                                                                | Title and description of an archive                      |
| `Pagination`              | none                                                                       | Newer and older links                                    |
| `SearchForm`              | `placeholder`                                                              | GET form to `/search`                                    |
| `EmptyState`              | `message`                                                                  | Message text                                             |
| `CategoryList`, `TagList` | `limit`                                                                    | Chips with links                                         |

Components render the content they are given. A component whose data is missing renders nothing, so one template can be used on several pages.

### Marketing components and content.json

Some themes need landing-page blocks such as domain search, price tables, feature lists and testimonials. These are the marketing components. They read their text and lists from `content.json` at the theme root, not from the template, so the same template can be filled with different copy.

| Component       | `content.json` key | Notes                                                             |
| --------------- | ------------------ | ----------------------------------------------------------------- |
| `DomainSearch`  | `search`           | Search box block                                                  |
| `ExtensionGrid` | `extensions`       | Grid of domain extensions with prices                             |
| `PricingGrid`   | any short key      | One table per key, e.g. `vps`, `hosting`. Each plan is validated. |
| `FeatureList`   | `features`         | Feature cards                                                     |
| `StatsStrip`    | `stats`            | Number and label pairs                                            |
| `Testimonials`  | `testimonials`     | Quote, name and role                                              |
| `LogoStrip`     | `partners`         | Partner logos                                                     |
| `OfficeList`    | `offices`          | Office addresses                                                  |
| `CtaBanner`     | `cta`              | Closing call-to-action                                            |
| `DocsPage`      | `docsnav`          | Documentation page: menu, table of contents, previous and next    |

Keys must be lowercase letters only (2–30 characters). The exact fields for each block are in `src/lib/themes/content-schemas.ts`. A block whose data is invalid is skipped, and in a list a bad item is skipped while the rest still render. The navigation (`nav`, including `children` for the mega menu) and the footer columns (`footer`) also come from `content.json`. Set `variant: "mega"` on `SiteHeader` to use the mega menu.

**Documentation pages.** `DocsPage` renders a static page in a documentation layout: a menu on the left, the page text in the middle, a table of contents (its h2 headings) on the right and links to the previous and next page. Put it alone in a custom page template (see `themes/webcore/templates/docs.json`) and give the pages `"template": "docs"` in `pages.json`. The menu comes from the `docsnav` block of `content.json`: `{ "title": "...", "groups": [{ "title": "...", "links": [{ "label": "...", "href": "/pages/slug" }] }] }`. The current page is highlighted by matching its `/pages/<slug>` address, and previous and next follow the order of the links. The menu is editable in the designer. Style it with the `.cms-docs*` classes; `themes/webcore/styles.css` has a full example.

**Optional fields an editor can add in the designer.** All are optional, so existing themes stay valid, and they work in any theme that uses these components:

- `headingLevel` (`h1`, `h2` or `h3`) on hero, title, search, pricing head and `cta` blocks. Without it the component keeps its own level (hero and search: `h1`; titles, pricing and `cta`: `h2`). Keep one `h1` per page.
- `image` on title blocks, `cta`, and on feature, process, value and teacher items (`assets/…` or `media/<id>`).
- `href` on feature, process and value items, and `href` with `linkLabel` on title blocks, for a "learn more" link.

The classes for these are `.cms-title__img`, `.cms-title__link`, `.cms-mkt__feature-img`, `.cms-mkt__more`, `.cms-mkt__cta-img` and `.cms-mkt__avatar--img`. A theme's `styles.css` styles them; `theme-template/styles.css` has a starting point.

`content.json` is checked when the theme is uploaded and again on activation. Its changes are picked up through the bundle cache fingerprint, so no restart is needed.

The **Webcore** theme in `themes/webcore/` (the default theme, with a home page and a user guide with screenshots), the **Hiên Studio** theme in `themes/hien-studio/` and the **english-center** theme use these blocks. Links in `content.json` that point to `/pages/...` need matching published pages to avoid 404s. Popups, the callback button and tabs are not included.

## Custom templates

A theme can offer more layouts than the core ones. Editors then choose a layout for each post or page in the admin, for example a full-width article or a landing page.

Declare each one in `theme.json`:

```json
"customTemplates": [
  { "id": "full-width", "label": "Full width article", "description": "Wide reading area.", "appliesTo": ["single-post"] },
  { "id": "landing", "label": "Landing page", "description": "Intro, featured post, grid.", "appliesTo": ["page"] }
]
```

| Field                  | Rules                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `id`                   | Lowercase letters and dashes, 2 to 31 characters. Also the file name: `templates/<id>.json`. |
| `label`, `description` | Shown to editors in the template picker.                                                     |
| `appliesTo`            | `single-post` (posts) and/or `page` (static pages).                                          |

Rules enforced at install:

- Every declared custom template must have its file. A file that is not declared is refused.
- `id` must be unique and must not be a core name (`home`, `single-post`, `archive`, `category`, `page`, `search`, `not-found`, `default`, `custom`).
- Its layout is validated like any other template.

What happens when things change:

| Situation                                                  | Result                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Editor picks a template the active theme does not offer    | Saving is refused with a clear message.                                        |
| Theme with the template is switched away                   | The stored choice is kept. The site uses the default layout for that content.  |
| Theme is switched back                                     | The template is used again.                                                    |
| Declared template file is removed from the installed theme | The theme is treated as invalid, so the site falls back to the fallback theme. |

Content is never changed by a theme switch. A template choice is just a stored name, so it survives every theme change.

### Adding a template to a theme

1. Create `templates/<id>.json` with a layout from the component list.
2. Add the entry to `customTemplates` in `theme.json`.
3. Bump `version` (for example `1.1.0`), pack the folder, and upload it. Uploading a higher version updates the theme and keeps a backup of the old one.
4. Editors select the template in the post or page editor.

No change to the CMS core is needed. The same mechanism works for any future template: a new layout file and a declaration.

## Static pages (pages.json)

A theme can bring its own static pages, for example About, Pricing and Contact. List them in `pages.json` at the theme root:

```json
[
  {
    "slug": "bao-gia",
    "title": "Báo giá",
    "template": "pricing",
    "body": "<h2>Chi phí thi công</h2><p>…</p>",
    "seoTitle": "",
    "seoDescription": ""
  }
]
```

| Field                        | Rules                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `slug`                       | Same rules as a page slug. Unique inside the file. Up to 30 pages.            |
| `title`                      | Required.                                                                     |
| `template`                   | `""` or the id of one of the theme's custom templates that applies to `page`. |
| `body`                       | HTML, cleaned with the page editor's sanitizer. Optional.                     |
| `seoTitle`, `seoDescription` | Optional.                                                                     |
| `isHome`                     | `true` marks the theme's home page. At most one, and `template` must be `""`. |

**Home page.** A page with `"isHome": true` is the theme's home page. It appears in the admin Pages list, is shown at `/` (its `/pages/<slug>` address redirects there), and keeps the home layout from the home designer and the SEO title and description. Like other theme pages it is created on install, published while the theme is active and hidden when another theme takes over, so each theme has its own home layout. The home still renders from the theme's `home` template; without an `isHome` page the layout is stored in the site settings as before.

The pages follow the theme:

| Event                      | What happens to the theme's pages                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Theme is uploaded          | Missing pages are created. They are hidden (draft) unless the theme is already active.                                 |
| Theme is updated           | New pages are added. Pages that exist keep their text, so an editor's changes survive; only the template is refreshed. |
| Theme is activated         | The pages are published at `/pages/<slug>`. The previous theme's pages are hidden first.                               |
| Another theme is activated | The pages become drafts and their address is parked as `<slug>--<theme id>`, so the next theme can use the same slug.  |
| Theme is uninstalled       | The pages are deleted.                                                                                                 |

A page the editor wrote with the same slug is never replaced. If it is in the way, the theme's page is skipped and the audit log says so. A page made before themes could ship pages, using one of the theme's own custom templates, is adopted by the theme on the next install or update.

## Categories, tags and posts (categories.json, tags.json, posts.json)

A theme can bring categories, tags and starter posts the same way it brings pages.

```json
// categories.json
[
  {
    "slug": "vat-lieu",
    "name": "Vật liệu",
    "description": "Chọn và bảo quản gỗ, đá, sơn.",
    "translations": { "en": { "name": "Materials", "description": "Choosing and caring for wood, stone and paint." } }
  }
]

// tags.json
[
  {
    "slug": "go-soi",
    "name": "Gỗ sồi",
    "translations": { "en": { "name": "Oak" } }
  }
]

// posts.json
[
  {
    "slug": "chon-go-cho-san-nha",
    "title": "Chọn gỗ cho sàn nhà",
    "excerpt": "",
    "body": "<p>…</p>",
    "categories": ["vat-lieu"],
    "tags": ["go-soi"],
    "publishedAt": "2026-09-12",
    "image": "assets/post-wood.jpg",
    "featured": false,
    "translations": { "en": { "title": "Choosing a wood floor", "body": "<p>…</p>" } }
  }
]
```

Up to 30 categories, 60 tags and 50 posts. Slugs follow the page slug rules and are unique inside each file. A post may only list categories from `categories.json` and tags from `tags.json`. `body` is cleaned with the editor's sanitizer. `publishedAt` is a day or a full ISO time. `image` is a picture from the theme's `assets/` folder (it must exist); it is shown as the post's picture everywhere, at `/theme-assets/<theme id>/current/...`. Authors are not part of the file: the author is the administrator who installs the theme.

A post can also carry short **fields**, facts shown on cards: `"fields": { "type": "Nhà phố", "area": "96 m² sàn", "schedule": "Thi công 78 ngày", "price": "Từ 1,35 tỷ" }`. All four keys are optional and each value is up to 120 characters. `translations.en.fields` replaces them in English. They refresh when the theme is updated; editors can also fill them in the post editor (Project details).

`CourseList` can show posts instead of fixed items: `{ "component": "CourseList", "props": { "source": "courses", "tag": "congtrinh", "limit": 3 } }` renders the newest published posts that carry the tag `congtrinh`, using the post's picture, title, link and fields (`type` as the label, `area`, `schedule`, `price`). While no post has the tag, the items of `source` are shown instead, so the page is never empty.

They follow the theme exactly like its pages:

| Event                      | Categories                                                            | Tags                                                                                  | Posts                                                          |
| -------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Theme is uploaded          | Missing ones are created, hidden unless the theme is active.          | Same.                                                                                 | Missing ones are created as drafts unless the theme is active. |
| Theme is updated           | New ones are added. Existing ones keep their text.                    | Follow the file: new ones are added, names and translations refresh, removed ones go. | New ones are added. Existing ones keep their text.             |
| Theme is activated         | Shown at `/categories/<slug>`. The previous theme's are hidden first. | Shown at `/tags/<slug>`. The previous theme's are hidden first.                       | Published at `/posts/<slug>`.                                  |
| Another theme is activated | Hidden, and the address is parked as `<slug>--<theme id>`.            | Hidden, and the address is parked the same way.                                       | Drafts, with the address parked the same way.                  |
| Theme is uninstalled       | Deleted.                                                              | Deleted.                                                                              | Deleted.                                                       |

Items an editor wrote are never replaced or deleted. A category, tag or post made before themes could ship them is adopted when it has the same slug and the same name (or title) as the theme's entry.

A tag that a later version of the theme no longer lists is deleted. If a post written by an editor still uses it, the tag is kept and becomes the editors' own, so that post does not lose it.

`translations.en` is read on the public site when the visitor picks English: post titles, excerpts, bodies and SEO text, category names and descriptions, tag names, and search. Editing a theme post in the admin changes the Vietnamese text only.

## Blog pages

The blog has five layouts, all made from the components above: `archive` (every post, at `/posts`), `category`, `single-post`, `search` and `not-found`.

- **`/posts`** lists every post with the category chips and the featured post on page 1. Its heading can come from the theme: `{ "component": "ArchiveHeader", "props": { "showCount": true, "source": "titlejournal" } }` reads a `title...` block, so it can be translated.
- **`SearchForm`** and **`EmptyState`** accept the same `source` (a `title...` block) instead of fixed words.
- **`CategoryList`** marks the category being viewed with `aria-current="page"`, so a theme can style it.
- **`PostList`** layouts are `grid` (cards), `list` (one row per post, good for search) and `compact`.
- **`PostDetail`** can add four extras, all off by default: `showToc` (a table of contents from the article's h2 headings; headings get ids), `showShare` (Facebook, X and email links, no script), `showAuthor` (author card) and `showAdjacent` (links to the previous and next post). Their classes are `.cms-article__layout`, `.cms-article__aside`, `.cms-toc`, `.cms-share`, `.cms-author` and `.cms-adjacent`.
- Post cards and the post header carry two elements that are hidden by default and that a theme may show: `.cms-post__tag` (the first category) and `.cms-post__read` ("4 min read"). The date separator and author are `.cms-post__sep` and `.cms-post__author`.

## Switching language

The base language is Vietnamese. A theme becomes switchable to English by shipping `content.en.json` next to `content.json`. It follows the same rules, and each block it contains **replaces** the block with the same name in `content.json` when the visitor picks English. Blocks it does not contain stay as they are. Any two-letter code works (`content.fr.json`), and the visitor's language is chosen with the language switch in the header.

What can be translated:

| Where the words are                      | How to translate them                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Marketing blocks, `nav`, `footer`, `cta` | Put the English block in `content.en.json` under the same key.                                                                                                                                                           |
| Hero blocks (keys starting with `hero`)  | Same. The block's `image` can point to another file, for example a picture with English labels.                                                                                                                          |
| Section headings                         | Do not write the words in the template. Use `{ "component": "SectionTitle", "props": { "source": "titleprojects" } }` and add a block whose key starts with `title` (`{ "title": "...", "text": "..." }`) to both files. |
| Static pages of the theme (`pages.json`) | Add `"translations": { "en": { "title": "...", "body": "...", "seoTitle": "", "seoDescription": "" } }`.                                                                                                                 |
| Words built into the core                | Already translated by the CMS (buttons, dates, "Read more", breadcrumbs).                                                                                                                                                |

Not translated: the site title (Admin → Settings), and posts, categories and pages written by editors. The English text of a theme page is read from the theme, so editing the page in the admin changes the Vietnamese text only.

## Stylesheet

Use the `cms-*` class names. The same markup appears in every theme, so a theme is a styling choice, not a rewrite.

Rules enforced at install:

- No `@import`, `expression()`, `behavior:`, `-moz-binding`, `javascript:`, or HTML markup.
- `url()` may refer only to files under `assets/` that exist.
- Maximum 200 KB.

Use the custom properties from your tokens (`var(--color-bg)`) so settings can change them.

## Assets

Images and fonts are served from `/theme-assets/<id>/<version>/assets/...` with immutable caching. Use relative references in CSS: `url(assets/logo.png)`.

Limits: 3 MB per file, 15 MB unpacked in total, 300 files, and a compression ratio of at most 100:1.

## Checking a theme before uploading

Upload the ZIP in **Admin → Themes**. The result lists every rejected file and rule, with a relative path for each. The same validation runs again when the theme is activated.

## Versioning and updates

Upload a new version with a higher `version` to update it. The previous version is copied to `data/backups/themes/`, and the new one replaces it in place. Uploading the same version again is refused. To restore an old version, upload its ZIP.

## Preview

In **Admin → Themes**, use **Preview**. It opens the theme in a new tab with a banner and a link token that expires after 10 minutes. The token grants nothing beyond viewing that rendering. Visitors still see the active theme.
