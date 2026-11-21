import { useId, useRef, useState } from "react";
import { IconArrowDown, IconArrowUp, IconBookmark, IconDots, IconFileExport, IconFocus2, IconPresentation, IconTrash } from "@tabler/icons-react";
import type { Viewport } from "@xyflow/react";
import { canvasViewLimits, sequenceViews, type CanvasView, type CanvasViewOrganizer } from "../../lib/modules/canvas/model";
import { Panel } from "./CanvasPanels";
import styles from "./SavedViews.module.css";

type Props = {
  views: CanvasView[];
  mode: NonNullable<CanvasView["mode"]>;
  organizer: CanvasViewOrganizer;
  changeViews: (update: (views: CanvasView[]) => CanvasView[]) => void;
  currentViewport: () => Viewport | undefined;
  frameSize: () => CanvasView["frameSize"];
  present: () => void;
  exportPdf: () => void;
  open: (view: CanvasView) => void;
  close: () => void;
};

export function SavedViews({ views, mode, organizer, changeViews, currentViewport, frameSize, present, exportPdf, open, close }: Props) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [rename, setRename] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("");
  const createInput = useRef<HTMLInputElement>(null);
  const manageButtons = useRef(new Map<string, HTMLButtonElement>());
  const detailsId = useId();
  const full = views.length >= canvasViewLimits.count;
  const included = sequenceViews(views).length;

  function readFraming() {
    const viewport = currentViewport();
    if (viewport) {
      const { x, y, zoom } = viewport;
      if ([x, y, zoom].every(Number.isFinite) && Math.abs(x) <= canvasViewLimits.position && Math.abs(y) <= canvasViewLimits.position
          && zoom >= canvasViewLimits.minZoom && zoom <= canvasViewLimits.maxZoom) {
        return {x, y, zoom, mode, frameSize: frameSize(), organizer: {...organizer, filters: [...organizer.filters]}};
      }
    }
    setStatus("Move or zoom the board, then try saving the view again.");
  }

  function createView() {
    const name = newName.trim();
    if (!name || full) return;
    const framing = readFraming();
    if (!framing) return;
    const view = { id: crypto.randomUUID(), name, ...framing };
    changeViews(current => current.length < canvasViewLimits.count ? [...current, view] : current);
    setNewName("");
    setStatus("Saved “" + name + "”.");
  }

  function moveView(view: CanvasView, direction: -1 | 1) {
    changeViews(current => {
      const index = current.findIndex(item => item.id === view.id);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) return current;
      const reordered = [...current];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(destination, 0, moved);
      return reordered;
    });
    // A move to either end disables that direction's button.
    manageButtons.current.get(view.id)?.focus();
    setStatus("Moved “" + view.name + "” " + (direction < 0 ? "up." : "down."));
  }

  function removeView(view: CanvasView, index: number) {
    const neighbor = views[index + 1] ?? views[index - 1];
    (neighbor ? manageButtons.current.get(neighbor.id) : createInput.current)?.focus();
    changeViews(current => current.filter(item => item.id !== view.id));
    setEditingId("");
    setConfirming(false);
    setStatus("Deleted “" + view.name + "”.");
  }

  return <Panel title="Saved views" close={close}>
    <div className={styles.content}>
      <form className={styles.create} onSubmit={event => { event.preventDefault(); createView(); }}>
        <label>View name<input ref={createInput} maxLength={canvasViewLimits.name} required disabled={full} value={newName} onChange={event => setNewName(event.target.value)} placeholder="e.g. Shortlisted ads" /></label>
        {full && <small>This board has reached its limit of {canvasViewLimits.count} saved views.</small>}
        <button className={styles.save} type="submit" disabled={full || !newName.trim()}>Save current view</button>
      </form>
      {views.length > 0 && <div className={styles.sequence}>
        <small>{included ? included+" of "+views.length+" in sequence" : "0 views in sequence. Open Manage on a view to include it."}</small>
        <button type="button" disabled={!included} onClick={present}><IconPresentation size={17}/>Present views</button>
        <button type="button" disabled={!included} onClick={exportPdf}><IconFileExport size={17}/>Export PDF</button>
      </div>}
      {views.length > 0 ? <ul className={styles.list} aria-label="Views on this board">
        {views.map((view, index) => {
          const editing = editingId === view.id;
          const percent = Number((view.zoom * 100).toFixed(1));
          return <li key={view.id}>
            <div className={styles.row}>
              <button type="button" className={styles.open} aria-label={view.name} onClick={() => open(view)}>
                <IconBookmark size={17} aria-hidden="true" />
                <span><strong>{view.name}</strong><small>{view.mode === "gallery" ? "Gallery" : "Board · " + percent + "% zoom"}</small></span>
              </button>
              <button type="button" className={styles.manage}
                ref={element => { if (element) manageButtons.current.set(view.id, element); else manageButtons.current.delete(view.id); }}
                aria-label={"Manage " + view.name} title={"Manage " + view.name}
                aria-expanded={editing} aria-controls={editing ? detailsId : undefined}
                onClick={() => { setEditingId(editing ? "" : view.id); setRename(view.name); setConfirming(false); setStatus(""); }}>
                <IconDots size={18} aria-hidden="true" />
              </button>
            </div>
            {editing && <div className={styles.details} id={detailsId} role="group" aria-label={"Manage " + view.name}>
              <label className={styles.include}><input type="checkbox" checked={view.inSequence!==false} onChange={event=>{
                const inSequence=event.target.checked;
                changeViews(current=>current.map(item=>item.id===view.id?{...item,inSequence}:item));
              }}/>Include in sequence</label>
              <form className={styles.rename} onSubmit={event => {
                event.preventDefault();
                const name = rename.trim();
                if (!name || name === view.name) return;
                changeViews(current => current.map(item => item.id === view.id ? { ...item, name } : item));
                setRename(name);
                manageButtons.current.get(view.id)?.focus();
                setStatus("Renamed view to “" + name + "”.");
              }}>
                <label>New name<input required maxLength={canvasViewLimits.name} value={rename} onChange={event => setRename(event.target.value)} /></label>
                <button type="submit" disabled={!rename.trim() || rename.trim() === view.name}>Rename</button>
              </form>
              <button type="button" className={styles.framing} aria-describedby={detailsId + "-framing"} onClick={() => {
                const framing = readFraming();
                if (!framing) return;
                const settings = view.organizer;
                if (framing.x === view.x && framing.y === view.y && framing.zoom === view.zoom && framing.mode === view.mode
                    && framing.frameSize?.width === view.frameSize?.width && framing.frameSize?.height === view.frameSize?.height
                    && settings?.groupBy === organizer.groupBy && settings.sortBy === organizer.sortBy
                    && settings.search === organizer.search && settings.filters.length === organizer.filters.length
                    && settings.filters.every((id, index) => id === organizer.filters[index])) {
                  setStatus("“" + view.name + "” already uses this view.");
                  return;
                }
                changeViews(current => current.map(item => item.id === view.id ? { ...item, ...framing } : item));
                setStatus("Updated view “" + view.name + "”.");
              }}><IconFocus2 size={16} aria-hidden="true" />Use current framing</button>
              <small id={detailsId + "-framing"}>Updates the position, zoom and organizer settings for this view.</small>
              <div className={styles.order}>
                <button type="button" disabled={index === 0} onClick={() => moveView(view, -1)}><IconArrowUp size={15} aria-hidden="true" />Move up</button>
                <button type="button" disabled={index === views.length - 1} onClick={() => moveView(view, 1)}><IconArrowDown size={15} aria-hidden="true" />Move down</button>
              </div>
              {confirming ? <div className={styles.confirm} role="group" aria-label={"Delete " + view.name + "?"}>
                <p>Delete “{view.name}” from this board?</p>
                <div>
                  <button type="button" autoFocus onClick={() => { setConfirming(false); manageButtons.current.get(view.id)?.focus(); }}>Cancel</button>
                  <button type="button" className={styles.danger} onClick={() => removeView(view, index)}>Confirm delete</button>
                </div>
              </div> : <button type="button" className={styles.delete} onClick={() => setConfirming(true)}><IconTrash size={15} aria-hidden="true" />Delete view</button>}
            </div>}
          </li>;
        })}
      </ul> : <p className={styles.empty}>Save this board position or gallery with its filters, grouping and sort order.</p>}
      <p className={styles.status} role="status">{status}</p>
    </div>
  </Panel>;
}
