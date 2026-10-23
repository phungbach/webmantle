import { definePlugin } from "@/lib/plugins/define";
import { SITE_URL } from "@/lib/env";

/**
 * Example plugin. Adds extra addresses to /sitemap.xml, for pages that are not in the CMS (for example
 * a landing page built in a theme). Paths are comma-separated and must start with /.
 */
export default definePlugin({
  id: "sitemap-extras",
  name: "Sơ đồ trang bổ sung",
  version: "1.0.0",
  description: "Thêm các đường dẫn tùy chọn vào sitemap.xml.",
  author: "CMS Core",
  minimumCmsVersion: "1.0.0",
  settings: [
    {
      key: "paths",
      label: "Đường dẫn (cách nhau bằng dấu phẩy, ví dụ /lien-he, /dich-vu)",
      type: "text",
      default: "",
      maxLength: 500,
    },
  ],
  activate(api) {
    api.addFilter("sitemap.entries", async (entries, env) => {
      const { paths } = await env.settings();
      const extra = String(paths)
        .split(",")
        .map((p) => p.trim())
        .filter((p) => /^\/[A-Za-z0-9._~\-/]*$/.test(p) && !p.includes(".."))
        .map((p) => ({
          url: `${SITE_URL}${p}`,
          changeFrequency: "monthly" as const,
          priority: 0.4,
        }));
      return [...entries, ...extra];
    });
  },
});
