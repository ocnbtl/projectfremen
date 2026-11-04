export type PhotoCropState = {
  sourceWidth: number;
  sourceHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  fit?: "contain" | "cover";
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function cropSpace(state: PhotoCropState) {
  // A project mark can occupy a transparent square with its full aspect ratio.
  const side = Math.max(state.sourceWidth, state.sourceHeight);
  return state.fit === "contain"
    ? { width: side, height: side, padX: (side - state.sourceWidth) / 2, padY: (side - state.sourceHeight) / 2 }
    : { width: state.sourceWidth, height: state.sourceHeight, padX: 0, padY: 0 };
}

/** Visible square expressed in source pixels, including any transparent margins. */
export function photoCrop(state: PhotoCropState) {
  const { width, height, padX, padY } = cropSpace(state);
  const side = Math.min(width, height) / state.zoom;
  return {
    side,
    x: (state.panX + 1) / 2 * (width - side) - padX,
    y: (state.panY + 1) / 2 * (height - side) - padY
  };
}

function position<T extends PhotoCropState>(state: T, x: number, y: number): T {
  const { side } = photoCrop(state);
  const { width, height, padX, padY } = cropSpace(state);
  const rangeX = width - side;
  const rangeY = height - side;
  return { ...state,
    panX: rangeX > 0 ? clamp((x + padX) / rangeX * 2 - 1, -1, 1) : 0,
    panY: rangeY > 0 ? clamp((y + padY) / rangeY * 2 - 1, -1, 1) : 0
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
