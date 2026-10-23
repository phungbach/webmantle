# SEO

SEO is part of the post editor (the **SEO** tab). It needs no paid plugin and no external service: every check runs in the browser or on the server, and every tag is produced by the Next.js Metadata API.

## What an editor sets

| Field                                    | Who                   | Notes                                                          |
| ---------------------------------------- | --------------------- | -------------------------------------------------------------- |
| SEO title                                | author, editor, admin | Empty = the post title                                         |
| Meta description                         | author, editor, admin | Empty = the excerpt, then the start of the content             |
| Focus keyword                            | author, editor, admin | Used by the checks only                                        |
| Robots (index / noindex)                 | editor, admin         | `noindex` keeps the post out of search results and the sitemap |
| Follow / nofollow                        | editor, admin         |                                                                |
| Canonical URL                            | editor, admin         | Must be a full `http(s)://` address                            |
| Twitter card type                        | editor, admin         | `summary` or `summary_large_image`                             |
| Share title and description (Open Graph) | author, editor, admin | Empty = SEO title and meta description                         |
| Share image                              | editor, admin         | Empty = the featured image                                     |
| Featured image and its alt text          | author, editor, admin | The alt text is saved in the media library                     |

Authors can save changes to the advanced fields without effect: the server keeps the existing values for those fields.

## Defaults

`src/lib/seo/resolve.ts` fills every empty field from the post, so every post has a title, description, canonical address and share image. Entered values always win. The site URL is taken from `SITE_URL`, which must be an origin only, for example `https://blog.example.com`.

## Checks

`src/lib/seo/analysis.ts` runs these checks on the content as it is in the editor:

- Length of the title (30–60 characters) and the description (70–160).
- Focus keyword in the title, the description, the first 100 words, an H2/H3 heading and the slug. Matching ignores Vietnamese diacritics.
- Content length (at least 300 words is recommended), an H1 inside the content (the title is already the H1), heading order and the use of H2 in long posts.
- Images without alt text, and a missing featured image or its alt text.
- Internal and external links.
- Slug length, a valid canonical address, and noindex.

Keyword density is shown for reference only. The checks do not promise a ranking and do not reward keyword repetition.

## What crawlers receive

The HTML returned by the server contains:

- `<title>` and `<meta name="description">`
- `<meta name="robots">` (`index`/`noindex`, `follow`/`nofollow`)
- `<link rel="canonical">`
- Open Graph tags (`og:title`, `og:description`, `og:image` with alt, `og:type` article, publish and modified times) for Facebook and Zalo
- Twitter card tags
- A `BlogPosting` JSON-LD block. Stored text is JSON-encoded and `<`, `>`, `&` are written as escapes, so it cannot close the script element.

Admin pages, the login page, search results, previews and error pages are marked `noindex`.

## Sitemap and robots

- `/sitemap.xml` lists only published posts whose date has arrived, that are allowed to be indexed, and whose canonical address is their own address. Static pages are included.
- `/robots.txt` allows the public site and disallows `/admin`, `/preview`, `/search` and `/api`, and points to the sitemap.

## Checking it yourself

```sh
curl -s https://blog.example.com/posts/your-slug | grep -E 'canonical|robots|og:title|ld\+json'
curl -s https://blog.example.com/sitemap.xml
```

Tests: `tests/unit/seo.test.ts`, `tests/integration/seo.test.ts`, `tests/e2e/seo.spec.ts`.

## Limits

- The checks are simple and do not read images or the rendered page. A post can pass every check and still rank poorly.
- Only posts have the full SEO tab. Static pages keep their own simple SEO fields.
- Meta keywords are not generated; search engines ignore them.
