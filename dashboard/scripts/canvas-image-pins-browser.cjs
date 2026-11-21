const assert=require("node:assert/strict");
const {expect}=require("@playwright/test");
const {randomUUID}=require("node:crypto");

// Run with the local browser harness's authenticated fixture and an uploaded
// portrait. Leave the old image card without intrinsic dimensions on purpose.
module.exports=async function checkImagePins(page,context,base,headers,image) {
  const id=randomUUID(), api=base+"/api/personal/canvas";
  const created=await context.request.post(api,{headers,data:{id,title:"Image pin review",folder:""}});
  const board=(await created.json()).board;
  const picture={...image,id:"picture",title:"Portrait study",x:44,y:100,width:250,height:210,locked:false};
  delete picture.imageSize;
  const other={id:"note",kind:"sticky",x:390,y:120,width:120,height:100,title:"Notes",body:"",color:"paper",group:"",used:false};
  const views=[{id:"start",name:"Review",x:0,y:0,zoom:1},{id:"overview",name:"Overview",x:200,y:160,zoom:.08}];
  const saved=await context.request.put(api,{headers,data:{expectedRevision:board.revision,board:{...board,nodes:[picture,other],views}}});
  assert(saved.ok());
  const read=async()=>(await (await context.request.get(api+"?id="+id)).json()).board.nodes[0];
  const requests=[];
  const requestsForPicture=request=>{
    const url=new URL(request.url());
    if(url.pathname.endsWith("/canvas/thumbnail") && url.searchParams.get("id")===picture.ref.objectId)requests.push(url);
  };
  page.on("request",requestsForPicture);
  await page.setViewportSize({width:1200,height:900});
  await page.goto(base+"/admin/personal/canvas?board="+id+"&view=start");
  const card=page.locator('.react-flow__node[data-id="picture"]');
  const button=name=>page.getByRole("button",{name,exact:true});
  const menu=card.getByRole("button",{name:/^Item actions/});
  const dialog=page.getByRole("dialog",{name:"Image pins"});
  const marker=card.getByRole("button",{name:"Pin 1: Check this edge"});
  await menu.click();await page.getByRole("menuitem",{name:"Image pins"}).click();
  const position=dialog.getByRole("button",{name:"Position pin 1"});
  await expect(position).toBeVisible();
  const box=await position.boundingBox();
  await position.click({position:{x:Math.round(.23*box.width),y:Math.round(.64*box.height)}});
  await position.press("ArrowRight");
  await dialog.getByLabel("Pin 1 note").fill("Check this edge");
  await button("Save pin").click();
  async function hoverWithoutMoving(target) {
    await page.mouse.move(3,3);
    const before=await target.boundingBox();await target.hover();
    await target.evaluate(async el=>{await Promise.allSettled(el.getAnimations().map(a=>a.finished));});
    const after=await target.boundingBox();
    for(const key of ["x","y","width","height"])assert(Math.abs(before[key]-after[key])<.5,"Pin hover moved its "+key);
  }
  await hoverWithoutMoving(dialog.getByRole("button",{name:"Pin 1: Check this edge"}));
  await button("Close panel").click();
  await expect.poll(async()=>(await read()).imagePins?.length).toBe(1);
  const [pin]=(await read()).imagePins;
  assert(Math.abs(pin.x-.24)<.01 && Math.abs(pin.y-.64)<.01,"Position is relative to the image, excluding letterboxing");
  async function markerIsAnchored(){
    const actual=await marker.boundingBox(),frame=await card.locator("img").boundingBox();
    const ratio=await card.locator("img").evaluate(img=>img.naturalWidth/img.naturalHeight);
    const w=Math.min(frame.width,frame.height*ratio),h=w/ratio;
    assert(Math.abs(actual.x+actual.width/2-(frame.x+(frame.width-w)/2+pin.x*w))<1.5);
    assert(Math.abs(actual.y+actual.height/2-(frame.y+(frame.height-h)/2+pin.y*h))<1.5);
  }
  async function drag(x,y,dx,dy){
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x+dx,y+dy,{steps:6});await page.mouse.up();
  }
  await hoverWithoutMoving(marker);await markerIsAnchored();
  const start=await card.boundingBox();await drag(start.x+20,start.y+20,28,15);
  await expect.poll(async()=>(await read()).x).not.toBe(picture.x);
  const handle=await card.locator(".react-flow__resize-control.handle.bottom.right").boundingBox();
  await drag(handle.x+handle.width/2,handle.y+handle.height/2,24,19);
  await expect.poll(async()=>(await read()).width).toBeGreaterThan(picture.width);
  await markerIsAnchored();
  await page.goto(base+"/admin/personal/canvas?board="+id+"&view=overview");
  await expect(marker).toBeVisible();await hoverWithoutMoving(marker);await markerIsAnchored();
  await page.goto(base+"/admin/personal/canvas?board="+id+"&view=start");
  await expect(marker).toBeVisible();await markerIsAnchored();
  assert(requests.length>0 && requests.every(url=>!url.searchParams.has("original")),"Small pinned cards use thumbnails");
  await page.setViewportSize({width:390,height:844});
  await marker.click();await expect(dialog.getByLabel("Pin 1 note")).toHaveValue(pin.text);
  await dialog.getByLabel("Pin 1 note").fill("Updated edge");await button("Save pin").click();
  await dialog.getByRole("button",{name:"1 Updated edge"}).click();await button("Remove pin").click();
  await expect.poll(async()=>(await read()).imagePins).toEqual([]);
  await button("Close panel").click();await button("Undo").click();
  await expect.poll(async()=>(await read()).imagePins?.[0]?.text).toBe("Updated edge");
  await button("Redo").click();await expect.poll(async()=>(await read()).imagePins).toEqual([]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  page.off("request",requestsForPicture);
  console.log("PASS letterboxed image pin placement, keyboard adjustment, drag, resize, reload, thumbnail-only reads, mobile edit/remove, Undo and Redo.");
};
