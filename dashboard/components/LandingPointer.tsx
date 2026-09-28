"use client";

import { useEffect, useRef } from "react";

function rippleMask() {
  // Independently placed crests and troughs create genuinely different outlines.
  // A closed, smooth spline keeps the random contour fluid rather than jagged.
  const count = 5 + Math.floor(Math.random() * 6);
  const stretchX = .62 + Math.random() * .38;
  const stretchY = .62 + Math.random() * .38;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index + (Math.random() - .5) * .45) / count * Math.PI * 2;
    const radius = index === 0 ? 200 : index === Math.floor(count / 2) ? 85 : 85 + Math.random() * 115;
    return { x: 320 + Math.cos(angle) * radius * stretchX, y: 320 + Math.sin(angle) * radius * stretchY };
  });
  const coordinate = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const path = points.map((point, index) => {
    const previous = points[(index + count - 1) % count];
    const next = points[(index + 1) % count];
    const after = points[(index + 2) % count];
    return `C${coordinate(point.x + (next.x - previous.x) / 6, point.y + (next.y - previous.y) / 6)} ${coordinate(next.x - (after.x - point.x) / 6, next.y - (after.y - point.y) / 6)} ${coordinate(next.x, next.y)}`;
  }).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><defs><filter id="soft" x="-75%" y="-75%" width="250%" height="250%"><feGaussianBlur stdDeviation="28"/></filter></defs><path d="M${coordinate(points[0].x, points[0].y)} ${path}Z" fill="none" stroke="white" stroke-width="${32 + Math.random() * 20}" filter="url(#soft)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export default function LandingPointer({ active }: { active: boolean }) {
  const effectsRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const effects = effectsRef.current;
    const cursor = cursorRef.current;
    const root = effects?.parentElement;
    if (!effects || !cursor || !root) return;
    const finePointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    let pressAnimation: Animation | undefined;
    const orb = cursor.firstElementChild as HTMLElement;

    const hide = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      delete root.dataset.customCursor;
      cursor.style.opacity = "0";
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !finePointer.matches) { hide(); return; }
      x = event.clientX;
      y = event.clientY;
      cursor.dataset.interactive = String(event.target instanceof Element && Boolean(event.target.closest("a, button, input")));
      if (!frame) frame = requestAnimationFrame(() => {
        cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        cursor.style.opacity = "1";
        root.dataset.customCursor = "true";
        frame = 0;
      });
    };
    const ripple = (clientX: number, clientY: number) => {
      if (reducedMotion.matches) return;
      const bounds = root.getBoundingClientRect();
      const wave = document.createElement("span");
      wave.className = "landing-click-ripple";
      wave.style.maskImage = rippleMask();
      wave.style.setProperty("--ripple-duration", `${3000 + Math.random() * 400}ms`);
      wave.style.setProperty("--ripple-angle", `${Math.random() * 360}deg`);
      wave.style.setProperty("--ripple-stretch", String(.85 + Math.random() * .25));
      wave.style.setProperty("--ripple-drift-x", `${Math.random() * 70 - 35}px`);
      wave.style.setProperty("--ripple-drift-y", `${Math.random() * 50 - 25}px`);
      const gradient = document.createElement("span");
      gradient.className = "landing-fluid-gradient";
      gradient.style.animationDelay = `${-(performance.now() % 1800)}ms, 0ms`;
      wave.appendChild(gradient);
      const size = Math.min(900, Math.max(bounds.width, window.innerHeight) * .85);
      wave.style.width = wave.style.height = `${size}px`;
      wave.style.left = `${clientX - bounds.left}px`;
      wave.style.top = `${clientY - bounds.top}px`;
      // Rapid clicking cannot accumulate decorative elements indefinitely.
      while (effects.children.length >= 6) effects.firstElementChild?.remove();
      effects.appendChild(wave);
      wave.addEventListener("animationend", (event) => {
        if (event.target === wave) wave.remove();
      });
    };
    const press = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      if (event.pointerType !== "mouse") hide();
      ripple(event.clientX, event.clientY);
      if (event.pointerType === "mouse" && !reducedMotion.matches) {
        pressAnimation?.cancel();
        pressAnimation = orb.animate([
          { transform: "scale(1)", offset: 0 },
          { transform: "scale(.62, .78)", offset: .22 },
          { transform: "scale(1.3, 1.18)", offset: .6 },
          { transform: "scale(1)", offset: 1 }
        ], { duration: 480, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    };
    const keyboardClick = (event: MouseEvent) => {
      if (event.detail !== 0 || !(event.target instanceof Element)) return;
      const bounds = event.target.getBoundingClientRect();
      ripple(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Tab") hide(); };
    const visibility = () => { if (document.hidden) hide(); };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", press, { passive: true });
    root.addEventListener("pointerleave", hide);
    root.addEventListener("click", keyboardClick);
    window.addEventListener("keydown", keydown);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    finePointer.addEventListener("change", hide);
    return () => {
      hide();
      pressAnimation?.cancel();
      effects.replaceChildren();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", press);
      root.removeEventListener("pointerleave", hide);
      root.removeEventListener("click", keyboardClick);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide);
      document.removeEventListener("visibilitychange", visibility);
      finePointer.removeEventListener("change", hide);
    };
  }, [active]);

  return <>
    <div ref={effectsRef} className="landing-pointer-effects" aria-hidden="true" />
    <div ref={cursorRef} className="landing-gradient-cursor" aria-hidden="true">
      <span className="landing-cursor-orb"><span className="landing-fluid-gradient" /></span>
    </div>
  </>;
}
