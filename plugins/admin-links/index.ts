import { definePlugin } from "@/lib/plugins/define";

/**
 * Example plugin. Adds links to the admin sidebar. Each line in the setting is "Label | address".
 * Addresses must be internal paths (starting with /) or http(s) links.
 */
export default definePlugin({
  id: "admin-links",
  name: "Liên kết quản trị",
  version: "1.0.0",
  description: "Thêm các liên kết tùy chọn vào thanh bên của trang quản trị.",
  author: "CMS Core",
  minimumCmsVersion: "1.0.0",
  settings: [
    {
      key: "links",
      label: "Liên kết (mỗi dòng: Tên | địa chỉ)",
      type: "text",
      default: "",
      maxLength: 500,
    },
  ],
  activate(api) {
    api.addFilter("admin.nav", async (items, env) => {
      const { links } = await env.settings();
      const extra = String(links)
        .split("\n")
        .map((line) => line.split("|").map((part) => part.trim()))
        .filter(
          ([label, href]) => label && href && (href.startsWith("/") || /^https?:\/\//.test(href))
        )
        .map(([label, href]) => ({ label: label!.slice(0, 60), href: href! }));
      return [...items, ...extra];
    });
  },
});
