import { imageSrcSet } from "@/lib/media-variants";

/**
 * srcset/sizes for images served by our own routes (/media/<id> and theme assets).
 * External (http/https), data: and unsupported formats get no srcset.
 */
export function responsiveImage(url: string, sizes: string): { srcSet?: string; sizes?: string } {
  if (url.includes("?") || url.startsWith("//")) return {};
  const isMedia = /^\/media\/[a-z0-9]+$/.test(url);
  const isThemeImage = /^\/theme-assets\/[^?#]+\/assets\/[^?#]+\.(jpe?g|png|webp)$/i.test(url);
  if (!isMedia && !isThemeImage) return {};
  return { srcSet: imageSrcSet(url), sizes };
}
