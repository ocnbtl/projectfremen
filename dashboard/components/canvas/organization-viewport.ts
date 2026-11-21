import { getViewportForBounds } from "@xyflow/react";
import type { Board, CanvasView } from "../../lib/modules/canvas/model";

export function savedViewport(view:CanvasView, size:{width:number;height:number}) {
  const old=view.frameSize;
  if (!old || !size.width || !size.height) return {x:view.x,y:view.y,zoom:view.zoom};
  const zoom=Math.max(.002, Math.min(3,view.zoom*Math.min(size.width/old.width,size.height/old.height)));
  const scale=zoom/view.zoom;
  return {zoom,x:size.width/2+(view.x-old.width/2)*scale,y:size.height/2+(view.y-old.height/2)*scale};
}

/** Supply only the visible nodes when the organizer has an active filter. */
export function arrangementViewport(board: Pick<Board,"nodes"|"arrangement">, size: {width:number;height:number}) {
  const rects = [
    ...board.nodes.map(n => ({x:n.x, y:n.y, width:n.width, height:n.height+42})),
    ...(board.arrangement?.bands.flatMap(band=>[band,band.region]) ?? [])
  ];
  if (!rects.length || !size.width || !size.height) return;
  const x=Math.min(...rects.map(r=>r.x)), y=Math.min(...rects.map(r=>r.y));
  const width=Math.max(...rects.map(r=>r.x+r.width))-x, height=Math.max(...rects.map(r=>r.y+r.height))-y;
  return getViewportForBounds({x,y,width,height},size.width,size.height,.002,1,.18);
}
