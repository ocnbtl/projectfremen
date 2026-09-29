/** Reads GPS from a bounded JPEG APP1 segment. No file leaves the device. */
export async function embeddedPhotoLocation(
  file: File,
): Promise<
  { latitude: number; longitude: number; source: "embedded" } | undefined
> {
  if (!/image\/jpeg/i.test(file.type)) return;
  const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
  try {
    if (view.getUint16(0) !== 0xffd8) return;
    for (let offset = 2; offset + 4 < view.byteLength; ) {
      const marker = view.getUint16(offset),
        length = view.getUint16(offset + 2);
      if (length < 2) return;
      const end = offset + 2 + length;
      if (
        marker === 0xffe1 &&
        end <= view.byteLength &&
        view.getUint32(offset + 4) === 0x45786966
      ) {
        const base = offset + 10,
          little = view.getUint16(base) === 0x4949;
        const u16 = (p: number) => {
          if (p < base || p + 2 > end) throw new Error();
          return view.getUint16(p, little);
        };
        const u32 = (p: number) => {
          if (p < base || p + 4 > end) throw new Error();
          return view.getUint32(p, little);
        };
        if (u16(base + 2) !== 42) return;
        const entries = (at: number) => {
          const n = u16(at);
          if (n > 512) throw new Error();
          return Array.from({ length: n }, (_, i) => at + 2 + i * 12);
        };
        const pointer = entries(base + u32(base + 4)).find(
          (at) => u16(at) === 0x8825,
        );
        if (pointer === undefined) return;
        const gps = new Map(
          entries(base + u32(pointer + 8)).map((at) => [u16(at), at]),
        );
        const ref = (tag: number) => {
          const at = gps.get(tag);
          if (at === undefined) return "";
          return String.fromCharCode(view.getUint8(at + 8));
        };
        const degrees = (tag: number) => {
          const at = gps.get(tag);
          if (at === undefined || u16(at + 2) !== 5 || u32(at + 4) !== 3)
            throw new Error();
          const p = base + u32(at + 8);
          const r = (i: number) => {
            const d = u32(p + i * 8 + 4);
            if (!d) throw new Error();
            return u32(p + i * 8) / d;
          };
          return r(0) + r(1) / 60 + r(2) / 3600;
        };
        const latRef = ref(1),
          lonRef = ref(3);
        if (!["N", "S"].includes(latRef) || !["E", "W"].includes(lonRef))
          return;
        const latitude = degrees(2) * (latRef === "S" ? -1 : 1),
          longitude = degrees(4) * (lonRef === "W" ? -1 : 1);
        if (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          Math.abs(latitude) <= 90 &&
          Math.abs(longitude) <= 180
        )
          return { latitude, longitude, source: "embedded" };
        return;
      }
      if (marker === 0xffda || marker === 0xffd9) return;
      offset = end;
    }
  } catch {
    return;
  }
}
