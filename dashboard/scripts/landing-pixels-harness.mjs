import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../lib/landing-pixels.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { createPixelField, advancePixelField, resizePixelField, PIXEL_SIZE } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
let seed = 42;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
let total = 0;
for (const [width, height] of [[1280, 720], [390, 844], [18, 14]]) {
  const field = createPixelField(width, height);
  const capacity = field.visibleColumns * field.visibleRows;
  const painted = new Map();
  for (let step = 0; step < capacity; step++) {
    const color = step % 4 + 1;
    const point = advancePixelField(field, color, random);
    assert.ok(point, "Every step grows until the entire screen is filled");
    const index = point.y / PIXEL_SIZE * field.columns + point.x / PIXEL_SIZE;
    assert.ok(!painted.has(index), "Existing paint must never be overwritten");
    painted.set(index, color);
  }
  for (const [index, color] of painted) assert.equal(field.cells[index], color, "All tails retain their original paint");
  const filled = field.cells.slice();
  for (let step = 0; step < 100; step++) assert.equal(advancePixelField(field, step % 4 + 1, random), null);
  assert.deepEqual(field.cells, filled, "A full screen never clears or reseeds");
  total += capacity;
}
const field = createPixelField(320, 240);
for (let step = 0; step < 3000; step++) advancePixelField(field, step % 4 + 1, random);
const oldColumns = field.columns;
const before = field.cells.slice();
resizePixelField(field, 180, 400);
resizePixelField(field, 600, 500);
for (let index = 0; index < before.length; index++) {
  assert.equal(field.cells[Math.floor(index / oldColumns) * field.columns + index % oldColumns], before[index], "Resize preserves every original cell and color");
}
assert.ok(advancePixelField(field, 1, random), "Growth resumes into expanded space");
console.log(`Passed ${total} permanent cells: full coverage, no erased tails, saturation, portrait, partial edge cells and resize preservation.`);
