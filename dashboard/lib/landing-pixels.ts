export const PIXEL_SIZE = 4;
type Cell = { x: number; y: number };
export type PixelField = {
  columns: number; rows: number; visibleColumns: number; visibleRows: number;
  cells: Uint8Array; frontiers: Cell[][]; directions: number[]; cursor: number;
};
const directions = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];

export function createPixelField(width: number, height: number): PixelField {
  const field: PixelField = { columns: 0, rows: 0, visibleColumns: 0, visibleRows: 0,
    cells: new Uint8Array(), frontiers: [[], [], [], []], directions: [0, 1, 2, 3], cursor: 0 };
  resizePixelField(field, width, height);
  return field;
}

export function resizePixelField(field: PixelField, width: number, height: number) {
  field.visibleColumns = Math.max(1, Math.ceil(width / PIXEL_SIZE));
  field.visibleRows = Math.max(1, Math.ceil(height / PIXEL_SIZE));
  const columns = Math.max(field.columns, field.visibleColumns);
  const rows = Math.max(field.rows, field.visibleRows);
  if (columns !== field.columns || rows !== field.rows) {
    const cells = new Uint8Array(columns * rows);
    for (let row = 0; row < field.rows; row++) {
      cells.set(field.cells.subarray(row * field.columns, (row + 1) * field.columns), row * columns);
    }
    field.cells = cells;
    field.columns = columns;
    field.rows = rows;
  }
  // Existing paint is never removed, including when the viewport shrinks.
  field.cursor = 0;
}

export function advancePixelField(field: PixelField, color: number, random = Math.random): Cell | null {
  const frontier = field.frontiers[color - 1];
  const available = (cell: Cell) => cell.x >= 0 && cell.y >= 0 && cell.x < field.visibleColumns &&
    cell.y < field.visibleRows && field.cells[cell.y * field.columns + cell.x] === 0;
  const paint = (cell: Cell, direction: number) => {
    field.cells[cell.y * field.columns + cell.x] = color;
    frontier.push(cell);
    field.directions[color - 1] = direction;
    return { x: cell.x * PIXEL_SIZE, y: cell.y * PIXEL_SIZE };
  };
  const firstDirection = random() < .65 ? field.directions[color - 1] : Math.floor(random() * 4);
  while (frontier.length) {
    const anchor = frontier[frontier.length - 1];
    for (let offset = 0; offset < 4; offset++) {
      const direction = (firstDirection + offset) % 4;
      const delta = directions[direction];
      const cell = { x: anchor.x + delta.x, y: anchor.y + delta.y };
      if (available(cell)) return paint(cell, direction);
    }
    frontier.pop(); // Retire an enclosed growth tip, never its painted cells.
  }
  // Seed another open region if this trail has been enclosed by the others.
  const seed = { x: Math.floor(random() * field.visibleColumns), y: Math.floor(random() * field.visibleRows) };
  if (available(seed)) return paint(seed, firstDirection);
  const capacity = field.visibleColumns * field.visibleRows;
  while (field.cursor < capacity) {
    const index = field.cursor++;
    const cell = { x: index % field.visibleColumns, y: Math.floor(index / field.visibleColumns) };
    if (available(cell)) return paint(cell, firstDirection);
  }
  return null; // A full screen remains painted; it never resets or erases tails.
}
