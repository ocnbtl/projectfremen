"use client";

import { Component, createRef, useEffect, useState, type ComponentPropsWithRef, type HTMLAttributes } from "react";
import type { DirectoryView } from "./ViewCycleButton";

type DirectoryProps = HTMLAttributes<HTMLDivElement> & { view: string };
type CardBounds = Map<HTMLElement, DOMRect>;
const cardSelector = "[data-directory-flip-card]";

function nearViewport(rect: DOMRect) {
  const margin = 80;
  return rect.width > 0 && rect.height > 0 && rect.bottom >= -margin && rect.top <= window.innerHeight + margin
    && rect.right >= -margin && rect.left <= window.innerWidth + margin;
}

/** Read the old layout before React changes any density classes, including ancestor classes. */
export class DirectoryLayout extends Component<DirectoryProps, Record<string, never>, CardBounds | null> {
  private root = createRef<HTMLDivElement>();
  private animations = new Map<HTMLElement, Animation>();

  private stopAnimations() {
    for (const [card, animation] of this.animations) {
      animation.cancel();
      card.removeAttribute("data-layout-animating");
    }
    this.animations.clear();
  }

  getSnapshotBeforeUpdate(previous: DirectoryProps): CardBounds | null {
    const root = this.root.current;
    if (!root || previous.view === this.props.view) return null;
    if (!root.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.stopAnimations();
      return null;
    }

    const before: CardBounds = new Map();
    for (const card of root.querySelectorAll<HTMLElement>(cardSelector)) {
      before.set(card, card.getBoundingClientRect());
    }
    // A rapid second switch starts at the card's current on-screen position.
    this.stopAnimations();
    return before;
  }

  componentDidUpdate(_previous: DirectoryProps, _state: Record<string, never>, before: CardBounds | null) {
    if (!before?.size) return;
    const moves: { card: HTMLElement; transform: string }[] = [];
    for (const [card, old] of before) {
      if (!card.isConnected || !old.width || !old.height) continue;
      const next = card.getBoundingClientRect();
      if (!next.width || !next.height || (!nearViewport(old) && !nearViewport(next))) continue;
      const dx = old.left - next.left;
      const dy = old.top - next.top;
      if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(old.width-next.width), Math.abs(old.height-next.height)) < 0.5) continue;
      moves.push({card, transform: `translate(${dx}px, ${dy}px) scale(${old.width/next.width}, ${old.height/next.height})`});
    }

    // Finish every geometry read before starting animations. The browser handles subsequent frames.
    for (const {card, transform} of moves) {
      const animation = card.animate(
        [{ transformOrigin: "top left", transform }, { transformOrigin: "top left", transform: "none" }],
        { duration: 260, easing: "cubic-bezier(.22,.78,.18,1)" }
      );
      this.animations.set(card, animation);
      card.setAttribute("data-layout-animating", "true");
      animation.onfinish = () => {
        if (this.animations.get(card) !== animation) return;
        this.animations.delete(card);
        card.removeAttribute("data-layout-animating");
      };
    }
  }

  componentWillUnmount() { this.stopAnimations(); }

  render() {
    const {view, children, ...props} = this.props;
    return <div {...props} ref={this.root} data-directory-view={view}>{children}</div>;
  }
}

export function MorphingArticle(props: ComponentPropsWithRef<"article">) {
  return <article {...props} data-directory-motion-card data-directory-flip-card />;
}
export function MorphingLi(props: ComponentPropsWithRef<"li">) {
  return <li {...props} data-directory-motion-card data-directory-flip-card />;
}
// Contents reflow with their card. They do not need separate layout subscriptions.
export function MorphingDiv({resize: _resize, ...props}: ComponentPropsWithRef<"div"> & {resize?: boolean}) {
  return <div {...props} data-directory-motion-part />;
}
export function MorphingSpan({resize: _resize, ...props}: ComponentPropsWithRef<"span"> & {resize?: boolean}) {
  return <span {...props} data-directory-motion-part />;
}
export function MorphingButton(props: ComponentPropsWithRef<"button">) { return <button {...props} data-directory-motion-part />; }
export function MorphingP(props: ComponentPropsWithRef<"p">) { return <p {...props} data-directory-motion-part />; }
export function MorphingStrong(props: ComponentPropsWithRef<"strong">) { return <strong {...props} data-directory-motion-part />; }

export function usePersonalDirectoryView() {
  const [view, setView] = useState<DirectoryView>("comfortable");
  useEffect(() => { try { const saved = localStorage.getItem("unigentamos.personal.directory-view"); if (saved === "comfortable" || saved === "compact" || saved === "grid") setView(saved); } catch {} }, []);
  return [view, (next: DirectoryView) => { setView(next); try { localStorage.setItem("unigentamos.personal.directory-view", next); } catch {} }] as const;
}
