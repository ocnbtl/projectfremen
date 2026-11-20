"use client";

import * as Popover from "@radix-ui/react-popover";
import { IconBookmark, IconCalendar, IconFolder } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import SearchField from "../ui/SearchField";
import SelectField from "../ui/SelectField";
import Icon from "../icons/UnigentamosIcon";
import { boardSummary, type Board, type BoardSummary } from "../../lib/modules/canvas/model";
import { colors } from "./board-layout";
import { BoardSession, canvasRequest, getBoard, keepPendingBoard, takePendingBoard } from "./board-session";
import styles from "./CanvasWorkspace.module.css";

const CanvasEditor = dynamic(() => import("./CanvasEditor"), {
  ssr:false,
  loading:() => <p className={styles.loading} role="status">Opening canvas…</p>
});
const base = "/admin/personal/canvas";
const boardUrl = (id:string,view?:string) => base+"?"+new URLSearchParams(view?{board:id,view}:{board:id});
const urlView = () => new URL(window.location.href).searchParams.get("view") || undefined;
const urlBoard = () => new URL(window.location.href).searchParams.get("board");
const sorts = ["Recent", "Name A–Z", "Most items"] as const;
type Sort = typeof sorts[number];
type BoardForm = { id: string; title: string; folder: string; original?: BoardSummary };
const message = (error: unknown) => error instanceof Error ? error.message : "Canvas couldn’t save your changes.";

function BoardPreview({item}: {item: BoardSummary}) {
  return <div className={styles.preview} aria-hidden="true">
    {item.nodeCount ? <div className={styles.map}>{item.preview.map((node,index) =>
      <i key={index} style={{left:node.x+"%",top:node.y+"%",width:node.width+"%",height:node.height+"%",backgroundColor:colors[node.color as keyof typeof colors] || node.color}}/>
    )}</div> : <Icon role="component" size={27}/>}
  </div>;
}

function BoardViews({item,openView}:{item:BoardSummary;openView:(view:string)=>void}) {
  const [open,setOpen]=useState(false),[legacyViews,setViews]=useState<Board["views"]>(),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!open || item.viewNames)return;
    let active=true;setViews(undefined);setError(false);
    getBoard(item.id).then(board=>{if(active)setViews(board.views);}).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[open,item.id,item.revision,item.viewNames,retry]);
  const views=item.viewNames ?? legacyViews;
  return <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild>
    <button className={styles.viewsButton} aria-label={"Saved views for "+item.title}><IconBookmark size={14}/>{item.viewCount} {item.viewCount===1?"saved view":"saved views"}</button>
  </Popover.Trigger><Popover.Portal><Popover.Content align="start" sideOffset={5} collisionPadding={12} className={styles.viewList} aria-label={"Views in "+item.title}>
    {error?<button onClick={()=>setRetry(n=>n+1)}>Retry loading views</button>:!views?<span role="status">Loading views…</span>:!views.length?<span>No saved views</span>:views.map(view=><a href={boardUrl(item.id,view.id)} key={view.id} onClick={e=>{
      if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();setOpen(false);openView(view.id);
    }}><IconBookmark size={15}/>{view.name}</a>)}
  </Popover.Content></Popover.Portal></Popover.Root>;
}

export default function CanvasWorkspace() {
  const [boards,setBoards] = useState<BoardSummary[]>([]);
  const [session,setSession] = useState<BoardSession | null>(null);
  const [entryView,setEntryView]=useState<string>();
  const current = useRef<BoardSession | null>(null);
  const [,redraw] = useState(0);
  const [loading,setLoading] = useState(true);
  const [opening,setOpening] = useState(false);
  const [error,setError] = useState("");
  const [query,setQuery] = useState("");
  const [folder,setFolder] = useState("");
  const [sort,setSort] = useState<Sort>("Recent");
  const [form,setForm] = useState<BoardForm|null>(null);
  const [formError,setFormError] = useState("");
  const [busy,setBusy] = useState(false);
  const locked = useRef(false);
  const routing = useRef(0);
  const alive = useRef(true);
  const library = useRef<HTMLDivElement>(null);
  const previousScroll = useRef(0);
  const returnTo = useRef("");
  const commitSummary = useCallback((saved:Board) => {
    const summary = boardSummary(saved);
    setBoards(rows => [...rows.filter(item => item.id !== saved.id), summary]);
  },[]);

  const openSession = useCallback((board: Board) => {
    setEntryView(undefined);
    const next = takePendingBoard(board.id) || new BoardSession(board, () => {});
    next.listen(() => {
      if (alive.current && current.current === next) {
        redraw(count=>count+1);
        if (!next.dirty) commitSummary(next.board);
      }
    });
    current.current = next;
    setSession(next);
    commitSummary(board);
    setError("");
  },[commitSummary]);

  const navigate = useCallback(async (id:string|null, fromHistory=false,view?:string) => {
    const previous = current.current;
    const ticket = ++routing.current;
    if (previous?.dirty && !await previous.flush()) {
      if (fromHistory && ticket === routing.current) window.history.replaceState(null,"",boardUrl(previous.board.id));
      return;
    }
    if (ticket !== routing.current || !alive.current) return;
    if (!id) {
      if (previous) returnTo.current = previous.board.id;
      current.current = null;
      setSession(null);
      setOpening(false);
      setError("");
      if (!fromHistory) window.history.pushState(null,"",base);
      return;
    }
    if (current.current?.board.id === id) return;
    if (library.current) previousScroll.current = library.current.scrollTop;
    setOpening(true); setError("");
    try {
      const board = await getBoard(id);
      if (!alive.current || ticket !== routing.current) return;
      openSession(board);
      setEntryView(view);
      if (!fromHistory) window.history.pushState(null,"",boardUrl(id,view));
    } catch (cause) {
      if (!alive.current || ticket !== routing.current) return;
      setError(message(cause));
      if (fromHistory) window.history.replaceState(null,"",previous ? boardUrl(previous.board.id) : base);
    } finally {
      if (alive.current && ticket === routing.current) setOpening(false);
    }
  },[openSession]);

  const loadLibrary = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await canvasRequest<{boards:BoardSummary[]}>("?summary=1");
      if (!alive.current) return;
      setBoards(rows => response.boards.map(board => {
        const local = rows.find(row => row.id === board.id);
        return local && local.revision > board.revision ? local : board;
      }).concat(rows.filter(row => !response.boards.some(board => board.id === row.id))));
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { if (alive.current) setLoading(false); }
  },[]);

  useEffect(() => {
    alive.current = true;
    void loadLibrary();
    if (urlBoard()) void navigate(urlBoard(),true,urlView());
    try {
      const preference = localStorage.getItem("unigentamos.canvas.sort") as Sort;
      if (sorts.includes(preference)) setSort(preference);
    } catch { /* Sorting works without browser storage. */ }
    const pop = () => {
      if (window.location.pathname === base) void navigate(urlBoard(),true,urlView());
    };
    const guard = (event:BeforeUnloadEvent) => {
      if (current.current?.dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    const flushWhenHidden = () => { if(document.hidden) void current.current?.flush(); };
    const leave = (event:MouseEvent) => {
      if (!current.current?.dirty || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.download || (link.target && link.target !== "_self") || link.hash && link.pathname === location.pathname && link.search === location.search) return;
      const href = link.href;
      if (new URL(href).origin !== location.origin) return;
      event.preventDefault(); event.stopPropagation();
      void current.current.flush().then(saved => { if (saved) location.assign(href); });
    };
    window.addEventListener("popstate",pop);
    window.addEventListener("beforeunload",guard);
    document.addEventListener("visibilitychange",flushWhenHidden);
    document.addEventListener("click",leave,true);
    return () => {
      alive.current = false;
      routing.current++;
      if (current.current) keepPendingBoard(current.current);
      window.removeEventListener("popstate",pop);
      window.removeEventListener("beforeunload",guard);
      document.removeEventListener("visibilitychange",flushWhenHidden);
      document.removeEventListener("click",leave,true);
    };
  },[loadLibrary,navigate]);

  useLayoutEffect(() => {
    if (session || !library.current || !returnTo.current) return;
    library.current.scrollTop = previousScroll.current;
    library.current.querySelector<HTMLElement>('[data-board-id="'+CSS.escape(returnTo.current)+'"]')?.focus({preventScroll:true});
  },[session]);

  function launchForm(item?:BoardSummary) {
    setFormError("");
    setForm({id:item?.id || crypto.randomUUID(), title:item?.title || "", folder:item?.folder ?? (folder.startsWith("folder:") ? folder.slice(7) : ""), original:item});
  }

  async function submit(event:FormEvent) {
    event.preventDefault();
    if (locked.current || !form?.title.trim()) return;
    locked.current=true; setBusy(true); setFormError("");
    try {
      const title=form.title.trim(), nextFolder=form.folder.trim();
      if (form.original) {
        const fresh = await getBoard(form.id);
        if (fresh.title !== form.original.title || fresh.folder !== form.original.folder) {
          setForm({...form,original:boardSummary(fresh)});
          throw new Error("This board was renamed or moved elsewhere. Save again to apply your name and folder.");
        }
        const {board} = await canvasRequest<{board:Board}>("", "PUT", { board:{...fresh,title,folder:nextFolder},expectedRevision:fresh.revision });
        commitSummary(board);
        if (folder && folder !== "folder:" + nextFolder) setFolder("");
      } else {
        const {board} = await canvasRequest<{board:Board}>("", "POST", { id:form.id,title,folder:nextFolder });
        previousScroll.current = library.current?.scrollTop || 0;
        openSession(board);
        window.history.pushState(null,"",boardUrl(board.id));
      }
      setForm(null);
    } catch (cause) { setFormError(message(cause)); }
    finally { locked.current=false; setBusy(false); }
  }

  async function recover() {
    if (!session || locked.current) return;
    locked.current=true; setBusy(true); setError("");
    try {
      const board=await session.saveCopy();
      openSession(board); window.history.replaceState(null,"",boardUrl(board.id));
      void loadLibrary();
    } catch (cause) { setError(message(cause)); }
    finally { locked.current=false; setBusy(false); }
  }

  if (session) return <div className={styles.workspace}>
    {(session.error || error) && <div className={styles.notice} role="alert"><span>{error || session.error}</span>
      {session.conflict ? <WorkspaceButton disabled={busy} onClick={()=>void recover()}>Save as copy</WorkspaceButton> :
        <WorkspaceButton onClick={()=>void session.flush()}>Retry save</WorkspaceButton>}
    </div>}
    <div className={styles.editor} inert={busy || opening || undefined}>
      <CanvasEditor key={session.board.id} board={session.board} entryView={entryView} onChange={board=>session.edit(board)} onBack={()=>void navigate(null)} saveStatus={session.status}/>
    </div>
  </div>;

  const folders=[...new Set(boards.map(board=>board.folder).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const visible=boards.filter(board=>(!folder || (folder==="unfiled" ? !board.folder : "folder:"+board.folder===folder)) &&
    (board.title+" "+board.folder).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>
      sort==="Name A–Z" ? a.title.localeCompare(b.title) : sort==="Most items" ? b.nodeCount-a.nodeCount || a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt));
  return <main className={styles.library} aria-label="Canvas library" ref={library}>
    <header className={styles.toolbar}>
      <div className={styles.path}><Link href="/admin/personal" prefetch={false}>Personal</Link><Icon role="chevron-right" size={15}/><h1>Canvas</h1></div>
      <SearchField aria-label="Search boards" placeholder="Search boards" value={query} onChange={e=>setQuery(e.target.value)} className={styles.search}/>
      <SelectField aria-label="Sort boards" title="Sort boards" className="toolbar-icon-select" triggerContent={<Icon role="sort" size={19}/>} value={sort} onChange={e=>{
        const next=e.target.value as Sort;setSort(next);try{localStorage.setItem("unigentamos.canvas.sort",next);}catch{}
      }}>{sorts.map(value=><option key={value}>{value}</option>)}</SelectField>
      <WorkspaceButton intent="primary" icon="plus" onClick={()=>launchForm()} disabled={loading || opening}>New board</WorkspaceButton>
    </header>
    <section className={styles.content} aria-label="Boards">
      {error && <div className={styles.notice} role="alert"><span>{error}</span><WorkspaceButton onClick={()=>void loadLibrary()}>Reload boards</WorkspaceButton></div>}
      {(loading || opening) ? <p className={styles.loading} role="status">{opening?"Opening board…":"Loading boards…"}</p> : <>
        {boards.length>0 && <div className={styles.subbar}><h2>Boards <small>{visible.length}</small></h2>
          <SelectField aria-label="Folder filter" value={folder} onChange={e=>setFolder(e.target.value)}><option value="">All folders</option><option value="unfiled">Unfiled</option>{folders.map(f=><option key={f} value={"folder:"+f}>{f}</option>)}</SelectField>
        </div>}
        <div className={styles.grid}>{visible.map(item=><article className={styles.card} key={item.id}>
          <a className={styles.cardLink} href={boardUrl(item.id)} data-board-id={item.id} aria-label={"Open "+item.title} onClick={e=>{
            if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();void navigate(item.id);
          }}>
            <BoardPreview item={item}/><div className={styles.identity}>
              <strong>{item.title}</strong>
              {item.folder && <span className={styles.folder}><IconFolder size={15}/>{item.folder}</span>}
              <div className={styles.meta}><time dateTime={item.updatedAt} title="Last edited"><IconCalendar size={14}/>{new Date(item.updatedAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</time><span>{item.nodeCount} {item.nodeCount===1?"item":"items"}</span></div>
            </div>
          </a>
          {item.viewCount>0 && <BoardViews item={item} openView={view=>void navigate(item.id,false,view)}/>}
          <button className={styles.organize} aria-label={"Organize "+item.title} title="Rename or move board" onClick={()=>launchForm(item)}><Icon role="edit" size={16}/></button>
        </article>)}</div>
        {!visible.length && !error && <div className={styles.empty}>
          <span><Icon role="component" size={30}/></span><h2>{boards.length?"No matching boards":"Your first canvas"}</h2>
          <p>{boards.length?"Try a different name or folder.":"Arrange media, notes, and linked objects on a board of your own."}</p>
          {boards.length ? <WorkspaceButton onClick={()=>{setFolder("");setQuery("");}}>Clear filters</WorkspaceButton> : <WorkspaceButton icon="plus" onClick={()=>launchForm()}>Create a board</WorkspaceButton>}
        </div>}
      </>}
    </section>
    <WorkspaceSheet open={!!form} onClose={()=>{if(!locked.current)setForm(null);}} title={form?.original?"Organize board":"New board"} titleIcon="component" presentation="center">
      {form && <form className={styles.form} onSubmit={submit}>
        <label>Board name<input required maxLength={160} value={form.title} placeholder="Static ad inspiration" onChange={e=>setForm({...form,title:e.target.value})}/></label>
        <label>Folder<input maxLength={120} value={form.folder} list="canvas-folders" placeholder="Unfiled" onChange={e=>setForm({...form,folder:e.target.value})}/></label>
        <datalist id="canvas-folders">{folders.map(f=><option key={f} value={f}/>)}</datalist>
        {formError && <p role="alert">{formError}</p>}
        <div><WorkspaceButton disabled={busy} onClick={()=>setForm(null)}>Cancel</WorkspaceButton><WorkspaceButton type="submit" intent="primary" icon={form.original?"check":"plus"} disabled={busy||!form.title.trim()}>{form.original?"Save changes":"Create board"}</WorkspaceButton></div>
      </form>}
    </WorkspaceSheet>
  </main>;
}
