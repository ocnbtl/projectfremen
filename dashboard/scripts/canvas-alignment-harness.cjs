const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { snapTranslation, spaceEvenly } = require("../components/canvas/alignment.ts");
const rect = (id, x, y, width, height) => Object.freeze({ id, x, y, width, height });

const moving = rect("moving", 0, 0, 40, 60);
const target = rect("target", 100, 120, 80, 100);
const snap = (x, y, zoom = 1) => snapTranslation([moving], [moving, target], { x, y }, zoom);
assert.deepEqual(snap(58, 56), {
  delta: { x: 60, y: 60 },
  guides: [
    { axis: "x", position: 100, start: 60, end: 220 },
    { axis: "y", position: 120, start: 60, end: 180 },
  ],
});
assert.deepEqual(snap(121, 137), {
  delta: { x: 120, y: 140 },
  guides: [
    { axis: "x", position: 140, start: 120, end: 220 },
    { axis: "y", position: 170, start: 100, end: 180 },
  ],
});
assert.equal(snap(55, 0, 2).delta.x, 55);
assert.equal(snap(55, 0, 1).delta.x, 60);
assert.equal(snap(50, 0, 0.5).delta.x, 60);
assert.equal(snap(47, 0, 0.5).guides.length, 0);
assert.equal(snap(0, 0).guides.length, 0);

const second = rect("second", 60, 60, 30, 30);
const block = snapTranslation([moving, second], [moving, second, target], { x: 8, y: 27 }, 1);
assert.deepEqual(block.delta, { x: 10, y: 30 });
assert.deepEqual(block.guides, [
  { axis: "x", position: 100, start: 30, end: 220 },
  { axis: "y", position: 120, start: 10, end: 180 },
]);
assert.deepEqual(snapTranslation([moving, second], [moving, second], { x: 1, y: 2 }, 1),
  { delta: { x: 1, y: 2 }, guides: [] });

const far = rect("far", 100, 900, 40, 10);
const near = rect("near", 100, 90, 40, 10);
assert.equal(snapTranslation([moving], [far, near], { x: 99, y: 0 }, 1).guides[0].end, 100);

const first = rect("first", -10, -30, 20, 40);
const middle = rect("middle", 70, 175, 30, 25);
const last = rect("last", 150, 320, 55, 75);
const selected = Object.freeze([last, first, middle]);
assert.deepEqual(spaceEvenly(selected, "x"), [last, first, { ...middle, x: 65 }]);
assert.deepEqual(spaceEvenly(selected, "y"), [last, first, { ...middle, y: 152.5 }]);
assert.deepEqual(spaceEvenly([last, first], "x"), [last, first]);
const overlapping = [rect("a", 0, 30, 100, 10), rect("b", 5, 20, 40, 10), rect("c", 10, 1, 70, 10)];
const spread = spaceEvenly(overlapping, "x");
assert.deepEqual(spread.map(n => n.x), [0, 124, 188]);
assert.deepEqual(spread.map(n => [n.y, n.width, n.height]), overlapping.map(n => [n.y, n.width, n.height]));
console.log("PASS canvas edge and center guides, zoom tolerance, rigid selections and equal edge spacing.");
