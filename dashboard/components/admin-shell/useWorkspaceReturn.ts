"use client";
import { useEffect } from "react";
type Position = { path: number[]; top: number; left: number; ancestor?: number };
type ReturnState = { url: string; positions: Position[]; target?: number[] };
// Memory only: search terms and profile information are never persisted to storage.
const returns = new Map<string, ReturnState>();
function pathTo(root: Element, element: Element) {
  const path: number[] = [];
  while (element !== root && element.parentElement) {
    path.unshift(Array.from(element.parentElement.children).indexOf(element));
    element = element.parentElement;
  }
  return path;
}
function at(root: Element, path: number[]) {
  return path.reduce<Element | undefined>((node, index) => node?.children[index], root) as HTMLElement | undefined;
}
export function workspaceReturnUrl(module: string, fallback: string) { return returns.get(module)?.url || fallback; }
export function useWorkspaceReturn(anchor: HTMLElement | null) {
  useEffect(() => {
    const root = anchor?.closest("[data-workspace-return], .workspace-pages, .workspace-people-pages, [data-personal-pages]") as HTMLElement | null;
    const main = root?.querySelector<HTMLElement>(":scope > main, :scope > aside");
    if (!root || !main) return;
    const module = root.dataset.workspaceReturn || root.dataset.module || window.location.pathname.split("/")[2] || "personal";
    let visible = main.getClientRects().length > 0;
    let frame = 0;
    let target: number[] | undefined;
    const capture = () => {
      if (!visible || !main.getClientRects().length) return;
      const positions: Position[] = [main, ...main.querySelectorAll<HTMLElement>("*")]
        .filter(node => node.scrollTop || node.scrollLeft)
        .map(node => ({ path: pathTo(main, node), top: node.scrollTop, left: node.scrollLeft }));
      let parent = main.parentElement, ancestor = 1;
      while (parent) {
        if (parent.scrollTop || parent.scrollLeft) positions.push({ path: [], ancestor, top: parent.scrollTop, left: parent.scrollLeft });
        parent = parent.parentElement; ancestor++;
      }
      returns.set(module, { url: window.location.pathname + window.location.search, positions, target });
    };
    const restore = () => {
      const saved = returns.get(module);
      if (!saved) return;
      frame = requestAnimationFrame(() => {
        for (const position of saved.positions) {
          let node = at(main, position.path);
          for (let index = 0; index < (position.ancestor || 0); index++) node = node?.parentElement || undefined;
          if (node) { node.scrollTop = position.top; node.scrollLeft = position.left; }
        }
        const item = saved.target && at(main, saved.target);
        if (item && item.getClientRects().length) {
          item.focus({ preventScroll: true });
          if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
            item.animate([{ backgroundColor: "var(--selected-bg, #edf1f6)" }, { backgroundColor: "transparent" }], { duration: 650, easing: "ease-out" });
        }
      });
    };
    const click = (event: Event) => {
      const item = (event.target as Element).closest<HTMLElement>("button, a, [role=button]");
      if (item && main.contains(item)) { target = pathTo(main, item); capture(); }
    };
    const scroll = (event: Event) => {
      const node = event.target;
      if (node === document || (node instanceof Element && (main.contains(node) || node.contains(main)))) capture();
    };
    const observer = new MutationObserver(() => {
      const next = main.getClientRects().length > 0;
      if (next && !visible) restore();
      visible = next;
    });
    observer.observe(root, { attributes: true, attributeFilter: ["hidden", "class", "data-detail-open", "data-record-page", "data-list-page"], subtree: true });
    main.addEventListener("click", click, true);
    document.addEventListener("scroll", scroll, true);
    if (visible && returns.get(module)?.url === window.location.pathname + window.location.search) restore();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); main.removeEventListener("click", click, true); document.removeEventListener("scroll", scroll, true); };
  }, [anchor]);
}
