import { getIconEntry, isIconCandidate } from "../../lib/icons/icon-registry";
import { PLACE_TAGS, placeTagIconRole } from "../../lib/modules/planning/place-tags";
import { MODULE_COLOR_SYSTEM } from "../../lib/design-system/color-system";

/** Rasterize the same local SVG sprite used by UnigentamosIcon for MapLibre's GPU layer. */
export async function placePinImages(selections: Readonly<Record<string, string>>, signal: AbortSignal) {
  const response = await fetch("/tabler-line-sprite.svg", { signal });
  if (!response.ok) throw new Error("Place icon sprite unavailable");
  const sprite = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
  const roles = [...PLACE_TAGS.map(placeTagIconRole), "place-tag-custom", "location"];
  return Promise.all(roles.flatMap(role => [false, true].map(async selected => {
    const entry = getIconEntry(role), requested = selections[role] || entry.defaultCandidate;
    const candidate = isIconCandidate(role, requested) ? requested : entry.defaultCandidate;
    const symbol = sprite.getElementById(`tabler-${candidate}`);
    if (!symbol) throw new Error(`Missing place icon: ${candidate}`);
    const color = selected ? "#ffffff" : MODULE_COLOR_SYSTEM.map.primary[900];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 24 24" fill="none" color="${color}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${symbol.innerHTML}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      signal.throwIfAborted();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 54;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Place icon canvas unavailable");
      context.drawImage(image, 0, 0);
      return { id: `pin-${role}${selected ? "-selected" : ""}`, image: context.getImageData(0, 0, 54, 54) };
    } finally { URL.revokeObjectURL(url); }
  })));
}

/** Contain logos and flags inside the same circular, centered pin geometry. */
export async function placePictureImage(source: string, signal: AbortSignal) {
  const image = new Image();
  image.src = source;
  await image.decode();
  signal.throwIfAborted();
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 84;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Place image canvas unavailable");
  context.beginPath(); context.arc(42, 42, 42, 0, Math.PI * 2); context.clip();
  context.fillStyle = "white"; context.fillRect(0, 0, 84, 84);
  const scale = Math.min(84 / image.naturalWidth, 84 / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  context.drawImage(image, (84-width)/2, (84-height)/2, width, height);
  return context.getImageData(0, 0, 84, 84);
}
