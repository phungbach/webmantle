/**
 * Square crop of a source image, in source pixels. The default (zoom 1, centred) is the largest
 * square that fits; zooming in shrinks the square; the centre is kept inside the image.
 */
export function squareCrop(
  width: number,
  height: number,
  zoom: number,
  center: { x: number; y: number }
): { sx: number; sy: number; side: number } {
  const z = Math.min(Math.max(zoom, 1), 4);
  const side = Math.min(width, height) / z;
  const cx = Math.min(Math.max(center.x, side / 2), width - side / 2);
  const cy = Math.min(Math.max(center.y, side / 2), height - side / 2);
  return { sx: cx - side / 2, sy: cy - side / 2, side };
}
