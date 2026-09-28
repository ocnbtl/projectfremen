"use client";

import { useEffect, useRef } from "react";

function rippleMask() {
  // Irregular, overlapping swells replace repeated silhouettes and evenly
  // spaced lobes. Every wave is generated afresh rather than chosen from a pool.
  const count = 32;
  const stretchX = .62 + Math.random() * .46;
  const stretchY = .62 + Math.random() * .46;
  const rotation = Math.random() * Math.PI * 2;
  const baseRadius = 145 + Math.random() * 25;
  const swells = Array.from({ length: 4 + Math.floor(Math.random() * 5) }, () => ({
    angle: Math.random() * Math.PI * 2,
    width: .24 + Math.random() * .8,
    depth: (Math.random() - .5) * 150
  }));
  const points = Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    const displacement = swells.reduce((sum, swell) => {
      const distance = Math.atan2(Math.sin(angle - swell.angle), Math.cos(angle - swell.angle));
      return sum + swell.depth * Math.exp(-.5 * (distance / swell.width) ** 2);
    }, 0);
    // Smoothly bound the contour instead of clipping it into flat-sided shapes.
    const radius = baseRadius + 70 * Math.tanh(displacement / 70);
    const px = Math.cos(angle) * radius * stretchX;
    const py = Math.sin(angle) * radius * stretchY;
    return { x: 352 + px * Math.cos(rotation) - py * Math.sin(rotation), y: 352 + px * Math.sin(rotation) + py * Math.cos(rotation) };
  });
  const coordinate = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const path = points.map((point, index) => {
    const previous = points[(index + count - 1) % count];
    const next = points[(index + 1) % count];
    const after = points[(index + 2) % count];
    return `C${coordinate(point.x + (next.x - previous.x) / 6, point.y + (next.y - previous.y) / 6)} ${coordinate(next.x - (after.x - point.x) / 6, next.y - (after.y - point.y) / 6)} ${coordinate(next.x, next.y)}`;
  }).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 704 704"><defs><filter id="soft" x="-75%" y="-75%" width="250%" height="250%"><feGaussianBlur stdDeviation="28"/></filter></defs><path d="M${coordinate(points[0].x, points[0].y)} ${path}Z" fill="none" stroke="white" stroke-width="${32 + Math.random() * 20}" filter="url(#soft)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function rippleGradient() {
  const hue = Math.random() * 360;
  const count = 4 + Math.floor(Math.random() * 3);
  const rotation = Math.random() * Math.PI * 2;
  // Feathered color clouds have no angular seam or pinwheel center. Their
  // positions, sizes and hues vary per wave, then remain stable as it expands.
  const clouds = Array.from({ length: count }, (_, index) => {
    const angle = rotation + index / count * Math.PI * 2 + Math.random() * .6;
    const reach = 22 + Math.random() * 18;
    const color = `${(hue + index * 360 / count + Math.random() * 36) % 360} ${70 + Math.random() * 18}% ${54 + Math.random() * 10}%`;
    return `radial-gradient(ellipse ${42 + Math.random() * 25}% ${42 + Math.random() * 25}% at ${50 + Math.cos(angle) * reach}% ${50 + Math.sin(angle) * reach}%, hsl(${color} / .96) 0%, hsl(${color} / .72) 24%, hsl(${color} / .32) 50%, hsl(${color} / .07) 76%, hsl(${color} / 0) 100%)`;
  });
  return `${clouds.join(", ")}, hsl(${hue} 76% 60%)`;
}

export default function LandingPointer({ active }: { active: boolean }) {
  const effectsRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const foregroundRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    const effects = effectsRef.current;
    const cursor = cursorRef.current;
    const foreground = foregroundRef.current;
    const root = effects?.parentElement;
    if (!effects || !cursor || !foreground || !root) return;
    const finePointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    let holdFrame = 0;
    let held = false;
    let activePointer: number | null = null;
    let lastTrailX = 0;
    let lastTrailY = 0;
    let lastEmission = 0;
    let lastPulseEmission = 0;
    let pressAnimation: Animation | undefined;
    const orb = cursor.firstElementChild as HTMLElement;
    type ForegroundCopy = {
      element: HTMLElement;
      sources: Element[];
      nodes: (HTMLElement | SVGElement)[];
      underline?: HTMLSpanElement;
    };
    const foregroundCopies = new Map<Element, ForegroundCopy>();
    const clearForeground = () => {
      foreground.replaceChildren();
      foregroundCopies.clear();
    };
    const copyStyle = (source: CSSStyleDeclaration, node: HTMLElement | SVGElement) => {
      for (const property of Array.from(source)) node.style.setProperty(property, source.getPropertyValue(property));
      node.style.animation = 'none';
      node.style.transition = 'none';
      node.style.pointerEvents = 'none';
    };
    const createForeground = (target: Element): ForegroundCopy => {
      // Mirror only masked character count; never copy the original password.
      const input = target instanceof HTMLInputElement;
      const copy = input ? document.createElement('input') : target.cloneNode(true) as HTMLElement;
      if (input) {
        (copy as HTMLInputElement).type = 'password';
        (copy as HTMLInputElement).placeholder = target.placeholder;
        (copy as HTMLInputElement).autocomplete = 'off';
      }
      const sources = [target, ...target.querySelectorAll('*')];
      const nodes = [copy, ...copy.querySelectorAll('*')] as (HTMLElement | SVGElement)[];
      nodes.forEach((node, index) => {
        copyStyle(getComputedStyle(sources[index]), node);
        node.removeAttribute('id');
        node.removeAttribute('href');
        node.removeAttribute('name');
        node.setAttribute('tabindex', '-1');
      });
      Object.assign(copy.style, {
        position: 'absolute', margin: '0', transform: 'none', zoom: '1',
        // Percentage constraints otherwise resolve against the zero-width
        // cursor origin and shift centered text, especially its second line.
        minWidth: '0', maxWidth: 'none', minHeight: '0', maxHeight: 'none'
      });
      if (!target.matches('.landing-logo-dot')) copy.style.background = 'transparent';
      copy.inert = true;
      copy.setAttribute('aria-hidden', 'true');
      let underline: HTMLSpanElement | undefined;
      if (target.matches('.landing-venture-name, .landing-back-link')) {
        underline = document.createElement('span');
        copy.appendChild(underline);
      }
      foreground.appendChild(copy);
      return { element: copy, sources, nodes, underline };
    };
    const drawCursor = () => {
      frame = 0;
      const hit = document.elementFromPoint(x, y);
      cursor.dataset.interactive = String(Boolean(hit?.closest('a, button, input, .landing-logo-wrap, .landing-description, .landing-title')));
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      cursor.style.opacity = '1';
      root.dataset.customCursor = 'true';
      const radius = orb.getBoundingClientRect().width / 2;
      const candidates = root.querySelectorAll('.landing-center .landing-title, .landing-center .landing-description, .landing-center .landing-venture-name, .landing-center .landing-logo-dot, .landing-center .landing-signin-toggle, .landing-center .landing-submit, .landing-center .landing-back-link, .landing-center .landing-input');
      const overlaps = new Map<Element, DOMRect>();
      candidates.forEach((target) => {
        if (target.closest('[aria-hidden="true"], [inert]')) return;
        const bounds = target.getBoundingClientRect();
        // Include outlines and every element touched by the expanded circle,
        // rather than only the element under its center.
        const dx = Math.max(bounds.left - 4 - x, 0, x - bounds.right - 4);
        const dy = Math.max(bounds.top - 4 - y, 0, y - bounds.bottom - 4);
        if (bounds.width && bounds.height && dx * dx + dy * dy <= radius * radius) overlaps.set(target, bounds);
      });
      foregroundCopies.forEach((copy, target) => {
        if (!overlaps.has(target)) { copy.element.remove(); foregroundCopies.delete(target); }
      });
      overlaps.forEach((bounds, target) => {
        let copy = foregroundCopies.get(target);
        if (!copy) { copy = createForeground(target); foregroundCopies.set(target, copy); }
        copy.nodes.forEach((node, index) => {
          const source = getComputedStyle(copy.sources[index]);
          node.style.color = source.color;
          node.style.fill = source.fill;
          node.style.stroke = source.stroke;
        });
        const source = getComputedStyle(target);
        Object.assign(copy.element.style, {
          left: `${bounds.left - x}px`, top: `${bounds.top - y}px`,
          width: `${bounds.width}px`, height: `${bounds.height}px`,
          outline: source.outline, outlineOffset: source.outlineOffset,
          borderColor: source.borderColor, boxShadow: source.boxShadow
        });
        if (target instanceof HTMLInputElement) {
          const inputCopy = copy.element as HTMLInputElement;
          inputCopy.value = 'x'.repeat(target.value.length);
          inputCopy.scrollLeft = target.scrollLeft;
        }
        if (copy.underline) {
          const underlineStyle = getComputedStyle(target, '::after');
          copyStyle(underlineStyle, copy.underline);
          copy.underline.style.display = underlineStyle.content === 'none' ? 'none' : 'block';
        }
      });
      // Track expansion, focus/hover transitions and moving dots while resting.
      if (foregroundCopies.size || hit?.closest('.landing-logo-wrap')) frame = requestAnimationFrame(drawCursor);
    };
    const release = () => {
      held = false;
      activePointer = null;
      cancelAnimationFrame(holdFrame);
      holdFrame = 0;
    };
    const hideCursor = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      clearForeground();
      delete root.dataset.customCursor;
      cursor.style.opacity = "0";
    };
    const hide = () => { release(); hideCursor(); };
    const move = (event: PointerEvent) => {
      if (!event.isPrimary || (held && event.pointerId !== activePointer)) return;
      x = event.clientX;
      y = event.clientY;
      // Touch and pen still drive the trail; only the custom cursor needs a mouse.
      if (event.pointerType !== "mouse" || !finePointer.matches) { hideCursor(); return; }
      // Recover if a release happened outside the browser before re-entry.
      if (!(event.buttons & 1)) release();
      if (!frame) frame = requestAnimationFrame(drawCursor);
    };
    const ripple = (clientX: number, clientY: number, kind: "click" | "trail" | "pulse" = "click") => {
      // Never erase a visible wave to make room: let every wave finish its fade.
      if (reducedMotion.matches || effects.children.length >= 240) return;
      const bounds = root.getBoundingClientRect();
      const wave = document.createElement("span");
      const trail = kind === "trail";
      const heldWave = kind !== "click";
      wave.className = `landing-click-ripple${heldWave ? ` landing-click-ripple--${kind}` : ""}`;
      wave.style.maskImage = rippleMask();
      wave.style.setProperty("--ripple-duration", trail ? "1200ms" : kind === "pulse" ? "2400ms" : `${3000 + Math.random() * 400}ms`);
      wave.style.setProperty("--ripple-angle", heldWave ? "0deg" : `${Math.random() * 360}deg`);
      wave.style.setProperty("--ripple-stretch", heldWave ? "1" : String(.85 + Math.random() * .25));
      wave.style.setProperty("--ripple-drift-x", heldWave ? "0px" : `${Math.random() * 70 - 35}px`);
      wave.style.setProperty("--ripple-drift-y", heldWave ? "0px" : `${Math.random() * 50 - 25}px`);
      const gradient = document.createElement("span");
      gradient.className = "landing-ripple-fill";
      // Choose colors and their placement once; never cycle a visible wave's fill.
      gradient.style.background = rippleGradient();
      wave.appendChild(gradient);
      const size = trail ? 360 : Math.min(kind === "pulse" ? 840 : 900, Math.max(bounds.width, window.innerHeight) * .85);
      wave.style.width = wave.style.height = `${size}px`;
      wave.style.left = `${clientX - bounds.left}px`;
      wave.style.top = `${clientY - bounds.top}px`;
      effects.appendChild(wave);
      wave.addEventListener("animationend", (event) => {
        if (event.target === wave) wave.remove();
      });
    };
    const connectTrail = () => {
      const distance = Math.hypot(x - lastTrailX, y - lastTrailY);
      const count = Math.min(6, Math.max(1, Math.ceil(distance / 18)));
      for (let step = 1; step <= count; step++) {
        const progress = step / count;
        ripple(lastTrailX + (x - lastTrailX) * progress, lastTrailY + (y - lastTrailY) * progress, "trail");
      }
      lastTrailX = x;
      lastTrailY = y;
    };
    const emitTrail = (now: number) => {
      if (!held) return;
      const distance = Math.hypot(x - lastTrailX, y - lastTrailY);
      const elapsed = now - lastEmission;
      if ((distance >= 18 && elapsed >= 32) || (distance >= 4 && elapsed >= 70)) {
        // Bridge between samples so quick drags do not leave isolated timer dots.
        connectTrail();
        lastEmission = now;
      }
      if (now - lastPulseEmission >= 320) {
        // A separate clock keeps stationary ripples steady even with small
        // hand movements. Skip missed beats instead of bursting after a stall.
        ripple(x, y, "pulse");
        lastPulseEmission = now - (now - lastPulseEmission) % 320;
      }
      holdFrame = requestAnimationFrame(emitTrail);
    };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== activePointer || event.button !== 0) return;
      if (held) {
        x = event.clientX;
        y = event.clientY;
        if (Math.hypot(x - lastTrailX, y - lastTrailY) > 4) connectTrail();
      }
      release();
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === activePointer) release();
    };
    const press = (event: PointerEvent) => {
      // Let a second finger take over for pinch zoom without drawing between fingers.
      if (!event.isPrimary) { if (event.pointerType === "touch") release(); return; }
      if (event.button !== 0) return;
      release();
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']")) return;
      x = event.clientX;
      y = event.clientY;
      if (event.pointerType !== "mouse") hideCursor();
      ripple(event.clientX, event.clientY, "click");
      if (!reducedMotion.matches) {
        held = true;
        activePointer = event.pointerId;
        lastTrailX = x;
        lastTrailY = y;
        lastEmission = performance.now();
        lastPulseEmission = lastEmission;
        holdFrame = requestAnimationFrame(emitTrail);
      }
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
    const select = (event: Event) => {
      if (held && !(event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']"))) {
        event.preventDefault();
      }
    };
    const visibility = () => { if (document.hidden) hide(); };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerdown", press, { passive: true });
    root.addEventListener("pointerleave", hide);
    root.addEventListener("lostpointercapture", cancel);
    root.addEventListener("click", keyboardClick);
    root.addEventListener("selectstart", select);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("dragstart", release);
    window.addEventListener("keydown", keydown);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    finePointer.addEventListener("change", hide);
    reducedMotion.addEventListener("change", hide);
    return () => {
      hide();
      pressAnimation?.cancel();
      effects.replaceChildren();
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerdown", press);
      root.removeEventListener("pointerleave", hide);
      root.removeEventListener("lostpointercapture", cancel);
      root.removeEventListener("click", keyboardClick);
      root.removeEventListener("selectstart", select);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("dragstart", release);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide);
      document.removeEventListener("visibilitychange", visibility);
      finePointer.removeEventListener("change", hide);
      reducedMotion.removeEventListener("change", hide);
    };
  }, [active]);

  return <>
    <div ref={effectsRef} className="landing-pointer-effects" aria-hidden="true" />
    <div ref={cursorRef} className="landing-gradient-cursor" aria-hidden="true">
      <span className="landing-cursor-orb"><span className="landing-fluid-gradient" /><span ref={foregroundRef} className="landing-cursor-foreground" aria-hidden="true" /></span>
    </div>
  </>;
}
