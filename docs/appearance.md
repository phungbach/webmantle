# Appearance

**Admin → Tùy chỉnh giao diện** sets how the whole website looks, whichever theme is active.

| Setting               | Stored as           | Effect on the public site                                                                                                                                   |
| --------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site name             | `siteTitle`         | Header, footer, feed and page titles.                                                                                                                       |
| Colour set            | `palette`           | `theme` keeps the theme's colours. Other values override `--color-accent` and `--color-accent-soft`.                                                        |
| Heading colour        | `h1Mode`, `h1Color` | `theme` follows the accent colour, `custom` uses `h1Color`, `default` uses charcoal `#111827`.                                                              |
| Seasonal effect       | `season`            | `off`, `auto` (chosen by month), or a fixed season: falling petals, sun, falling leaves, or snow.                                                           |
| Motion effects        | `motion`            | `on` (default) or `off`. Fades blocks in while they scroll into view, draws a scroll progress bar, adds a header shadow and hover effects, for every theme. |
| Block developer tools | `blockDevtools`     | Blocks F12, Ctrl/Cmd+Shift+I/J/C and Ctrl/Cmd+U.                                                                                                            |
| Logo and favicon      | `logoMediaId`       | Shown in the header and footer; the same image is the browser tab icon (`/site-icon`).                                                                      |

## Notes

- **Colours** are written as CSS custom properties after the theme's own styles, so they win without changing any theme file. Only the fixed palette values and validated hex colours are written.
- **Seasonal effect** is decoration only. It is hidden for visitors who ask their device to reduce motion, and it does not block clicks.
- **Motion effects** are plain CSS (`src/lib/motion.ts`), no script. They sit behind `prefers-reduced-motion: no-preference`, and the scroll-driven parts (reveal, progress bar, header shadow) behind `@supports (animation-timeline: view())`, so older browsers simply show the page without them. They use the `translate` property, so a theme's own hover `transform` keeps working. They are not applied inside the designer. Themes can add their own animations in `styles.css` the same way (see `themes/webcore`).
- **Developer-tools guard** is a basic deterrent. The HTML is always sent to the visitor, and the browser menu can still open developer tools. Do not rely on it to protect content.
- **Logo** is cropped to a 512×512 square in the browser before upload, so no image library is needed on the server. The server checks the file contents again like any media upload. Transparent PNG or WebP works best.
- Changes apply immediately: public pages are rendered per request.

## Where it lives in the code

- `src/lib/appearance.ts`: defaults, validation, palettes, season, motion, CSS generation.
- `src/lib/motion.ts`: the site-wide motion CSS.
- `src/components/theme/theme-frame.tsx`: applies the colours, the season layer and the guard to every public page and preview.
- `src/components/public/season-overlay.tsx`, `src/components/public/devtools-guard.tsx`.
- `src/components/admin/logo-uploader.tsx`: in-browser crop and upload.
- `src/app/admin/appearance/page.tsx`, `src/app/admin/actions/appearance.ts`.
- Tests: `tests/unit/appearance.test.tsx`, `tests/integration/appearance.test.tsx`, `tests/e2e/appearance.spec.ts`.
