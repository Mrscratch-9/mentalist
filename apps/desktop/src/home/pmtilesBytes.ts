/** PMTiles files start with the ASCII magic "PMTiles" (followed by a version byte). */
const MAGIC = [0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73];

/** True when the bytes begin with the PMTiles magic, so an HTML fallback served with 200 is rejected. */
export function isPmtilesHeader(bytes: Uint8Array): boolean {
  return bytes.length >= MAGIC.length && MAGIC.every((b, i) => bytes[i] === b);
}
