/**
 * Address of an image named in a theme's content: "media/<id>" is a picture of the media library,
 * anything else is a file of the theme's assets folder.
 */
export function contentImageUrl(themeId: string, version: string, ref: string): string {
  const media = /^media\/([a-z0-9]{10,40})$/.exec(ref);
  if (media) return `/media/${media[1]}`;
  // Callers parse the reference with assetImage first; this is a second line of defence against
  // traversal or foreign addresses.
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) || ref.includes("..")) return "";
  return `/theme-assets/${themeId}/${version}/${ref}`;
}
