const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { snapResize, snapTranslation, spaceEvenly } = require("../components/canvas/alignment.ts");
const { duplicateItems,makeNode } = require("../components/canvas/board-layout.ts");
const { boardContents } = require("../lib/modules/canvas/model.ts");
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

const card = rect("card", 100, 100, 200, 120);
const resize = (proposal, targets, zoom = 1, media = false, start = card) =>
  snapResize(card, start, { ...start, ...proposal }, [card, ...targets], zoom, media);
const layoutOf = ({ x, y, width, height }) => ({ x, y, width, height });
const lowerRight = rect("target", 345, 265, 170, 100);
const corner = resize({ width: 242, height: 163 }, [lowerRight]);
assert.deepEqual(corner, {
  rect: { x: 100, y: 100, width: 245, height: 165 },
  guides: [{ axis: "x", position: 345, start: 100, end: 365 }, { axis: "y", position: 265, start: 100, end: 515 }],
});
const upperLeft = rect("target", -150, -105, 200, 170);
assert.deepEqual(resize({ x: 53, y: 69, width: 247, height: 151 }, [upperLeft]).rect,
  { x: 50, y: 65, width: 250, height: 155 });
for (const [proposal, axis, edge] of [
  [{ width: 243 }, "x", 345], [{ height: 163 }, "y", 265],
  [{ x: 53, width: 247 }, "x", 50], [{ y: 68, height: 152 }, "y", 65],
]) {
  const result = resize(proposal, [upperLeft, lowerRight]);
  assert.deepEqual(result.guides.map(g => [g.axis, g.position]), [[axis, edge]]);
  assert.equal(result.rect[axis === "x" ? "height" : "width"], axis === "x" ? card.height : card.width);
}
const center = rect("center", 145, 100, 160, 180);
const centerRight = resize({ width: 247 }, [center]);
assert.deepEqual(centerRight.rect, { x: 100, y: 100, width: 250, height: 120 });
assert.deepEqual(centerRight.guides.map(g => g.position), [225]);
const centerTop = resize({ y: 156, height: 64 }, [rect("center", 0, 117, 90, 100)]);
assert.deepEqual(centerTop.guides, []); // The minimum height keeps the opposite edge fixed.
assert.equal(centerTop.rect.y + centerTop.rect.height, 220);
const centerUp = resize({ y: 42, height: 178 }, [rect("center", 500, 80, 200, 100)]);
assert.deepEqual(centerUp.rect, { x: 100, y: 40, width: 200, height: 180 });
assert.deepEqual(centerUp.guides.map(g => g.position), [130]);
assert.deepEqual(resize({ width: 241 }, [lowerRight], 2).guides, []);
assert.equal(resize({ width: 241 }, [lowerRight], 1).rect.width, 245);
assert.deepEqual(resize({}, [card, center]), { rect: layoutOf(card), guides: [] });
assert.deepEqual(resize({ width: 201 }, []).guides, []);
assert.deepEqual(resize({ height: 155 }, [rect("fixed", 100, 500, 200, 120)]).guides, []);

const proportional = resize({ width: 242, height: 145.2 }, [rect("edges", 345, 247, 150, 90)], 1, true);
assert.deepEqual(proportional.rect, { x: 100, y: 100, width: 245, height: 147 });
assert.deepEqual(proportional.guides.map(g => g.axis), ["x", "y"]);
const conflict = resize({ width: 242, height: 145.2 }, [rect("conflict", 345, 246, 150, 90)], 1, true);
assert.deepEqual(conflict.guides.map(g => [g.axis, g.position]), [["y", 246]]);
assert.equal(conflict.rect.width / conflict.rect.height, card.width / card.height);
const fromTopLeft = resize({ x: 62, y: 77.2, width: 238, height: 142.8 }, [rect("meeting", -140, 500, 200, 90)], 1, true);
assert.deepEqual(fromTopLeft.rect, { x: 60, y: 76, width: 240, height: 144 });
const fractional = rect("fractional", -4.2, 35, 150.4, 100.2);
const measured = { ...fractional, width: 150, height: 100 };
const fromMeasured = snapResize(fractional, measured, { ...measured, width: 180, height: 120 }, [], 1, true);
assert.equal(fromMeasured.rect.width / fromMeasured.rect.height, fractional.width / fractional.height);
assert.equal(fromMeasured.rect.x, fractional.x);
console.log("PASS resize edge and center guides, fixed anchors, screen tolerance, minimum size and proportional media.");

const first = rect("first", -10, -30, 20, 40);
const middle = rect("middle", 70, 175, 30, 25);
const last = rect("last", 150, 320, 55, 75);
const selected = Object.freeze([last, first, middle]);
assert.deepEqual(spaceEvenly(selected, "x"), [last, first, { ...middle, x: 65 }]);
assert.deepEqual(spaceEvenly(selected, "y"), [last, first, { ...middle, y: 152.5 }]);
assert.deepEqual(spaceEvenly([last, first], "x"), [last, first]);
const overlapping = [rect("a", 0, 3, 100, 10), rect("b", 5, 2, 40, 10), rect("c", 10, 1, 70, 10)];
const spread = spaceEvenly(overlapping, "x");
assert.deepEqual(spread.map(n => n.x), [0, 124, 188]);
assert.deepEqual(spread.map(n => [n.y, n.width, n.height]), overlapping.map(n => [n.y, n.width, n.height]));
for (const axis of ["x","y"]) {
  const transpose = n => axis==="x"?n:rect(n.id,n.y,n.x,n.height,n.width);
  const ads = Array.from({length:46},(_,i)=>transpose(rect(String(i),(i%3)*124,Math.floor(i/3)*360,100,200)));
  assert.deepEqual(spaceEvenly(ads,axis),ads);
  const moved=spaceEvenly(ads,axis,12);
  assert.deepEqual(moved.map(n=>n[axis]), ads.map((_,i)=>(i%3)*112));
  assert.deepEqual(spaceEvenly(moved,axis,12),moved);
}
console.log("PASS canvas edge and center guides, zoom tolerance, rigid selections and equal edge spacing.");
assert.deepEqual(spaceEvenly([last,first],"x",0).map(n=>n.x),[10,-10]);
const a={...makeNode("text",{x:15,y:30}),strokeColor:"#102030",strokeWidth:3,locked:true,group:"Ads"};
const b={...makeNode("sticky",{x:55,y:60}),group:"Ads"},c=makeNode("text",{x:20,y:90});
const wire=(source,target)=>({id:crypto.randomUUID(),source:source.id,target:target.id,label:"Next",style:"dashed",symbol:"arrow"});
const board={title:"Fixture",folder:"",nodes:[a,b,c],edges:[wire(a,b),wire(b,c)],views:[]};
const copies=duplicateItems(board,[a,b],24);
assert.equal(copies.edges.length,1);assert.deepEqual([copies.edges[0].source,copies.edges[0].target],copies.nodes.map(n=>n.id));
assert(copies.nodes.every(n=>n.group==="Ads copy"&&!n.locked));assert.equal(copies.nodes[0].x,39);
assert.equal(copies.nodes[0].appearance,"outline");assert.equal(copies.nodes[0].strokeWidth,3);
assert.deepEqual(boardContents({...board,...copies}).nodes,copies.nodes);
assert.throws(()=>boardContents({...board,nodes:[{...a,strokeColor:"invalid"}]}));
console.log("PASS exact gaps and independent duplicates with retained styles and internal connections.");
