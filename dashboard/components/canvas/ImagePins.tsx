"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { imagePinLimits, type CanvasNode, type ImagePin } from "../../lib/modules/canvas/model";
import type { NativeObjectRef } from "../../lib/native-objects/types";
import { CanvasMediaThumbnail } from "./CanvasIntake";
import { Panel } from "./CanvasPanels";
import { WritingText } from "../writing/WritingText";
import { writingPlainText } from "../../lib/writing/tokens";
import css from "./CanvasEditor.module.css";
import styles from "./ImagePins.module.css";

type Point = Pick<ImagePin,"x"|"y">;
const center:Point = {x:0.5,y:0.5};
const clamp = (value:number)=>Math.max(0,Math.min(1,value));
const location = ({x,y}:Point)=>({left:x*100+"%", top:y*100+"%"});

// The overlay follows the decoded rendition, including thumbnails on legacy
// cards. Its container has the same centered object-fit:contain geometry.
export function PinImage({target,full,onOriginal,onAvailability,children}:{
  target:NativeObjectRef; full?:boolean; onOriginal?:(width:number,height:number)=>void;
  onAvailability?:(available:boolean)=>void; children?:ReactNode;
}) {
  const [ratio,setRatio]=useState(0);
  return <div className={styles.surface}>
    <div className={css.art} role="img" aria-label={target.label}
      onLoadCapture={event=>{
        const image=event.target;
        if(image instanceof HTMLImageElement && image.naturalHeight){
          setRatio(image.naturalWidth/image.naturalHeight);onAvailability?.(true);
        }
      }}
      onErrorCapture={()=>{setRatio(0);onAvailability?.(false);}}>
      <CanvasMediaThumbnail target={target} full={full} onOriginal={onOriginal}/>
    </div>
    {ratio>0 && children && <div className={styles.pixels} style={{"--image-ratio":ratio} as CSSProperties}>{children}</div>}
  </div>;
}

export function PinMarkers({pins,open}:{pins:ImagePin[];open:(pinId:string)=>void}) {
  return pins.map((pin,index)=><button key={pin.id} type="button" className={`nodrag nopan ${styles.marker}`}
    style={location(pin)} title={writingPlainText(pin.text)} aria-label={`Pin ${index+1}: ${writingPlainText(pin.text)}`}
    onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}
    onClick={e=>{e.stopPropagation();open(pin.id);}}><span>{index+1}</span></button>);
}

export function ImagePinsPanel({node,initialPinId,save,close}:{
  node:CanvasNode; initialPinId?:string; save:(pins:ImagePin[])=>void; close:()=>void;
}) {
  const pins=node.imagePins??[];
  const initial=pins.find(pin=>pin.id===initialPinId);
  const [draft,setDraft]=useState<ImagePin|null>(()=>initial || (pins.length?null:{...center,id:"",text:""}));
  const [available,setAvailable]=useState(false);
  const index=draft?.id?pins.findIndex(pin=>pin.id===draft.id):-1;
  const number=index<0?pins.length+1:index+1;
  function setPosition(point:Point) {
    setDraft(current=>current && {...current,...point});
  }
  function apply(){
    if(!draft || !draft.text.trim() || (!draft.id && (!available || pins.length>=imagePinLimits.count)))return;
    const saved={...draft,id:draft.id || crypto.randomUUID(),text:draft.text.trim()};
    save(draft.id?pins.map(pin=>pin.id===draft.id?saved:pin):[...pins,saved]);
    setDraft(null);
  }
  return <Panel title="Image pins" close={close}>
    <div className={styles.preview}>
      <PinImage target={node.ref!} onAvailability={setAvailable}>
        {draft ? <button type="button" className={styles.place} aria-label={`Position pin ${number}`}
          aria-describedby="canvas-pin-instructions"
          onClick={e=>{
            if(!e.detail)return;
            const box=e.currentTarget.getBoundingClientRect();
            setPosition({x:clamp((e.clientX-box.left)/box.width),y:clamp((e.clientY-box.top)/box.height)});
          }}
          onKeyDown={e=>{
            const step=e.shiftKey?.1:.01;
            const delta:Record<string,Point>={ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}};
            if(delta[e.key]){e.preventDefault();setPosition({x:clamp(draft.x+delta[e.key].x),y:clamp(draft.y+delta[e.key].y)});}
          }}><span aria-hidden className={styles.crosshair} style={location(draft)}/></button>
          : <PinMarkers pins={pins} open={id=>setDraft(pins.find(pin=>pin.id===id)??null)}/>}
      </PinImage>
    </div>
    {draft ? <form onSubmit={e=>{e.preventDefault();apply();}}>
      <small id="canvas-pin-instructions">Tap the image to place the pin. Use the arrow keys for fine adjustments.</small>
      <label>Pin {number} note<textarea data-writing-field="on" rows={3} maxLength={imagePinLimits.text} value={draft.text}
        onChange={e=>setDraft({...draft,text:e.target.value})}/></label>
      <div className={styles.controls}>
        {draft.id && <button type="button" className={styles.remove} onClick={()=>{save(pins.filter(pin=>pin.id!==draft.id));setDraft(null);}}>Remove pin</button>}
        <button type="button" onClick={()=>setDraft(null)}>Cancel</button>
        <button type="submit" className={css.primary} disabled={!draft.text.trim() || (!draft.id && !available)}>Save pin</button>
      </div>
    </form> : <>
      {pins.length>0 && <ol className={styles.list} aria-label="Pinned notes">{pins.map((pin,i)=>
        <li key={pin.id}>{pin.text.includes("](/admin/") ? <div className={styles.markedPin}>
          <button type="button" aria-label={"Edit pin " + (i+1)} onClick={()=>setDraft(pin)}><b>{i+1}</b></button>
          <span><WritingText text={pin.text}/></span>
        </div> : <button type="button" onClick={()=>setDraft(pin)}><b>{i+1}</b><span>{pin.text}</span></button>}</li>
      )}</ol>}
      <button type="button" className={css.primary} disabled={!available || pins.length>=imagePinLimits.count}
        onClick={()=>setDraft({...center,id:"",text:""})}>Add pin</button>
    </>}
  </Panel>;
}
