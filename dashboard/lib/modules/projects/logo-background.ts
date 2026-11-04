/** Remove only a flat matte connected to the outside of a logo. Enclosed
 * highlights and disconnected areas of the same color stay intact. */
export function clearLogoMatte(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  const count = width * height;
  if (count < 4 || count > 1600 * 1600 || rgba.length !== count * 4) return false;
  const matches = (p: number) => rgba[p + 3] >= 245 && Math.abs(rgba[p] - rgba[0]) <= 20 &&
    Math.abs(rgba[p + 1] - rgba[1]) <= 20 && Math.abs(rgba[p + 2] - rgba[2]) <= 20;
  if (![0, width - 1, count - width, count - 1].every(i => matches(i * 4))) return false;
  const seen = new Uint8Array(count), queue = new Uint32Array(count);
  let front = 0, end = 0;
  function enqueue(i: number) {
    if (seen[i]) return;
    seen[i] = 1;
    if (matches(i * 4)) queue[end++] = i;
  }
  for (let x = 0; x < width; x++) { enqueue(x); enqueue(count - width + x); }
  for (let y = 1; y < height - 1; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (front < end) {
    const i = queue[front++];
    if (i % width) enqueue(i - 1);
    if (i % width !== width - 1) enqueue(i + 1);
    if (i >= width) enqueue(i - width);
    if (i < count - width) enqueue(i + width);
  }
  if (end === count) return false;
  for (let j = 0; j < end; j++) rgba[queue[j] * 4 + 3] = 0;
  return true;
}
