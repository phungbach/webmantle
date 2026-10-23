import { definePlugin } from "@/lib/plugins/define";

/**
 * Example plugin. Adds rel="nofollow noopener noreferrer" to links that leave the site when a post
 * is saved, and optionally opens them in a new tab. The content is still sanitized after this runs.
 */
export default definePlugin({
  id: "external-links",
  name: "Liên kết ngoài",
  version: "1.0.0",
  description: "Thêm nofollow cho liên kết ra ngoài khi lưu bài, và tùy chọn mở trong tab mới.",
  author: "CMS Core",
  minimumCmsVersion: "1.0.0",
  settings: [
    {
      key: "newTab",
      label: "Mở liên kết ngoài trong tab mới",
      type: "boolean",
      default: true,
    },
  ],
  activate(api) {
    api.addFilter("post.beforeSave", async (input, env) => {
      const { newTab } = await env.settings();
      const siteHost = (process.env.SITE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
      input.body = input.body.replace(
        /<a\b([^>]*?)href="(https?:\/\/[^"]+)"([^>]*)>/gi,
        (match, before, href, after) => {
          if (siteHost && href.includes(`//${siteHost}`)) return match;
          const extra = newTab === true ? ' target="_blank"' : "";
          return `<a${before}href="${href}"${after} rel="nofollow noopener noreferrer"${extra}>`;
        }
      );
      return input;
    });
  },
});
