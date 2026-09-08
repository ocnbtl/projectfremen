export type PhotoCropState = {
  sourceWidth: number;
  sourceHeight: number;
  zoom: number;
  panX: number;
  panY: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The same source-pixel rectangle drives both the preview and JPEG export. */
export function photoCrop(state: PhotoCropState) {
  const side = Math.min(state.sourceWidth, state.sourceHeight) / state.zoom;
  return {
    side,
    x: (state.panX + 1) / 2 * (state.sourceWidth - side),
    y: (state.panY + 1) / 2 * (state.sourceHeight - side)
  };
}

function position<T extends PhotoCropState>(state: T, x: number, y: number): T {
  const { side } = photoCrop(state);
  const rangeX = state.sourceWidth - side;
  const rangeY = state.sourceHeight - side;
  return { ...state,
    panX: rangeX > 0 ? clamp(x / rangeX * 2 - 1, -1, 1) : 0,
    panY: rangeY > 0 ? clamp(y / rangeY * 2 - 1, -1, 1) : 0
  };
}

/** Drag distances are fractions of the visible square, so the picture follows the pointer 1:1. */
export function movePhotoCrop<T extends PhotoCropState>(state: T, dx: number, dy: number): T {
  const crop = photoCrop(state);
  return position(state, crop.x - dx * crop.side, crop.y - dy * crop.side);
}

/** Keep the source pixel beneath the zoom anchor stationary, until an image edge is reached. */
export function zoomPhotoCrop<T extends PhotoCropState>(state: T, zoom: number, anchorX = .5, anchorY = .5): T {
  const old = photoCrop(state);
  const next = { ...state, zoom: clamp(zoom, 1, 3) };
  const { side } = photoCrop(next);
  return position(next, old.x + anchorX * (old.side - side), old.y + anchorY * (old.side - side));
}
