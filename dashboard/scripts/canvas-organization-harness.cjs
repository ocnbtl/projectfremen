const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText, filename,
);
const {defaultArrangementOptions, organizeBoard, resolveCanvasView, snapshotPositions} = require("../components/canvas/board-organization.ts");
const {boardContents} = require("../lib/modules/canvas/model.ts");

const opts = {groupBy:"color", sortBy:"title", filters:["include"], search:""};
const style = {...defaultArrangementOptions, rowBy:"color", columnBy:"item/type",
  rowName:"Palette", columnName:"Format", labelOverrides:[{axis:"row",key:"red",label:"Warm tones"}],
  rowTint:"#ffaaaa", columnTint:"#aaaaff", rowOutline:"#ff0000", columnOutline:"#0000ff",
  rowAlternateTint:"#ffffff",columnAlternateTint:"#2468af",
  headerStyle:"outline", headerBold:false, headerFont:"serif", headerAlign:"right", headerTextColor:"#626262"};
const categories = [
  {id:"color",name:"Color",tags:[{id:"red",name:"Red"},{id:"blue",name:"Blue"}]},
  {id:"status",name:"Status",tags:[{id:"include",name:"Include"}]},
];
const node = (id, extra) => ({id, title:id, kind:"sticky", x:0,y:0,width:240,height:160,
  body:"",color:"paper",group:"",used:false,...extra});
const image = node("photo",{kind:"object",width:3200,height:2200,imageSize:{width:3200,height:2200},
  imagePins:[{id:"pin",x:.55,y:.38,text:"Review this"}],tagIds:["blue","red","include"],
  ref:{module:"media",objectType:"asset",objectId:"photo",label:"Photo",route:"/admin/media"}});
const nodes = [image,node("blues",{tagIds:["blue","include"]}),node("unclassified",{tagIds:["include"]}),
  node("tall",{tagIds:["red","include"],width:600,height:2300}),node("hidden",{x:15,y:35}),node("locked",{x:150,y:50,locked:true,tagIds:["include"]})];
const view = {id:"old",name:"Existing camera",x:0,y:0,zoom:1};
const edge = {id:"edge",source:"photo",target:"tall",style:"solid",symbol:"arrow",label:""};
const board = {id:"test",title:"Test",folder:"",updatedAt:"",revision:1,nodes,edges:[edge],categories,views:[view]};
const overlap=(a,b)=>a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
const inside=(a,b)=>a.x>=b.x && a.y>=b.y && a.x+a.width<=b.x+b.width && a.y+a.height<=b.y+b.height;
const result=organizeBoard(board,opts,style), bands=result.arrangement.bands;
const band=(axis,key)=>bands.find(b=>b.axis===axis && b.key===key);
assert.deepEqual(result.edges,board.edges);
assert.equal(result.nodes.length,nodes.length);
assert.equal(band("row","red").label,"Warm tones");
assert.equal(band("row","red").axisName,"Palette");
assert.equal(band("column","media").axisName,"Format");
assert.equal(band("row","").label,"No tag in Color");
assert(inside(result.nodes[0],band("row","red").region));
assert(inside(result.nodes[0],band("column","media").region));
for(let i=0;i<4;i++) {
  const placed=result.nodes[i], original=nodes[i];
  assert.deepEqual({...placed,x:original.x,y:original.y},original);
  for(const other of result.nodes) if(placed!==other) assert(!overlap(placed,other));
  for(const header of bands) assert(!overlap(placed,header));
}
for(const fixed of result.nodes.slice(4)) {
  assert.equal(fixed,nodes.find(n=>n.id===fixed.id));
  for(const header of bands) assert(!overlap(header.region,fixed));
}
assert.deepEqual(organizeBoard(result,opts,style),result);
assert.deepEqual(resolveCanvasView(result,view).nodes,nodes);
const saved={...view,id:"saved",positions:snapshotPositions(result.nodes),arrangement:result.arrangement};
const changed={...result,nodes:result.nodes.map(n=>({...n,x:9900,body:"New content"}))};
const edited=resolveCanvasView(changed,saved), presented=resolveCanvasView(changed,saved,false);
assert.equal(edited.nodes.at(-1).x,9900);
assert.deepEqual(snapshotPositions(presented.nodes),saved.positions);
assert.equal(presented.nodes[0].body,"New content");
const restored=boardContents({...result,views:[saved]});
assert.deepEqual(restored.arrangement,result.arrangement);
assert.deepEqual(restored.views[0],saved);
assert.deepEqual(restored.legacyPositions,snapshotPositions(nodes));
assert.throws(()=>boardContents({...result,arrangement:{...result.arrangement,rowTint:"red"}}));
assert.throws(()=>boardContents({...result,views:[{...saved,positions:[saved.positions[0],saved.positions[0]]}]}));
assert.throws(()=>boardContents({...result,views:[{...saved,positions:[{id:"photo",x:Infinity,y:0}]}]}));
const deleted=boardContents({...result,nodes:nodes.slice(1),edges:[],views:[saved]});
assert(!deleted.views[0].positions.some(n=>n.id==="photo"));
assert(!deleted.legacyPositions.some(n=>n.id==="photo"));
const legacy=resolveCanvasView(result,{...view,mode:"gallery",organizer:opts});
assert.deepEqual(legacy.arrangement.bands.map(b=>b.label),["Red","Blue","No tag in Color"]);
const grid=organizeBoard(board,opts,defaultArrangementOptions);
assert.deepEqual(grid.arrangement.bands.map(b=>b.label),["Row 1","Row 2","Column 1","Column 2"]);
const columns=organizeBoard(board,opts,{...defaultArrangementOptions,columnBy:"color"});
assert(columns.arrangement.bands.some(b=>b.axis==="row"&&b.label==="Row 1"));
assert(columns.arrangement.bands.some(b=>b.axis==="column"&&b.label==="Red"));
const empty=organizeBoard(board,{...opts,search:"nothing matches"},style);
assert.deepEqual(empty.arrangement.bands,[]);
assert.deepEqual(empty.nodes,nodes);

const crowd=Array.from({length:1000},(_,i)=>node("item-"+i,{
  x:9_999_950-(i%50)*560,y:-9_999_950+Math.floor(i/50)*630,
  width:120+(i*83)%4500,height:95+(i*29)%3000,
  locked:i%29===0,tagIds:i%5===0?["red"]:["blue","include"],
}));
const dense=organizeBoard({...board,nodes:crowd,edges:[]},opts,style);
assert.equal(dense.nodes.length,crowd.length);
for(let i=0;i<crowd.length;i++) {
  const n=dense.nodes[i];
  if(crowd[i].locked || !crowd[i].tagIds.includes("include")) {
    assert.equal(n,crowd[i]);
  } else {
    for(let j=0;j<crowd.length;j++) if(i!==j) assert(!overlap(n,dense.nodes[j]));
  }
}
boardContents(dense);
console.log("Canvas physical layout, obstacles, styles, persistence and saved-view checks passed.");
