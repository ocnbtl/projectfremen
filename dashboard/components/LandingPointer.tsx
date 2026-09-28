"use client";

import { useEffect, useRef } from "react";

function rippleMask() {
  const phase = Math.random() * Math.PI * 2;
  const secondaryPhase = Math.random() * Math.PI * 2;
  const points = Array.from({ length: 144 }, (_, index) => {
    const angle = index / 144 * Math.PI * 2;
    const radius = 174 + Math.sin(angle * 3 + phase) * 15 + Math.sin(angle * 5 + secondaryPhase) * 9 + Math.cos(angle * 2 - phase) * 11;
    return `${index ? "L" : "M"}${(256 + Math.cos(angle) * radius).toFixed(2)},${(256 + Math.sin(angle) * radius).toFixed(2)}`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter></defs><path d="${points.join(" ")}Z" fill="none" stroke="white" stroke-width="30" filter="url(#soft)"/></svg>`;
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
      wave.style.setProperty("--ripple-angle", `${Math.random() * 60 - 30}deg`);
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
