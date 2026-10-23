/**
 * The plugin list. To add a plugin:
 *   1. Create plugins/<id>/index.ts with definePlugin({...}).
 *   2. Import it here and add it to PLUGINS.
 *   3. Restart the server. Turn it on in Admin → Plugins.
 * Plugins are reviewed code that ships with the repository. Nothing is uploaded or run from the web.
 */
import type { PluginDefinition } from "@/lib/plugins/types";
import externalLinks from "./external-links";
import adminLinks from "./admin-links";
import sitemapExtras from "./sitemap-extras";

export const PLUGINS: PluginDefinition[] = [externalLinks, adminLinks, sitemapExtras];
