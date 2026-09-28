"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconArrowRight, IconLogin2 } from "@tabler/icons-react";
import LandingPointer from "./LandingPointer";

type LandingProps = {
  hasError?: boolean;
  errorPath: string;
  successPath?: string;
  showBackLink?: boolean;
};

const COLORS = {
  orange: "#FF4E00",
  blue: "#0D2D42",
  green: "#174D36",
  brown: "#4D342A"
} as const;

const DOT_COLORS = [
  COLORS.orange,
  COLORS.blue,
  COLORS.green,
  COLORS.orange,
  COLORS.brown,
  COLORS.blue,
  COLORS.brown,
  COLORS.green,
  COLORS.blue,
  COLORS.orange,
  COLORS.green,
  COLORS.blue
];

const LOGO_SIZE = 168;
const DOT_COUNT = 12;
const LOGO_RADIUS = LOGO_SIZE * 0.38;
const DOT_RADIUS = LOGO_SIZE * 0.07;
const CENTER = LOGO_SIZE / 2;
const VENTURES = [
  { name: "madagin", url: "https://madagin.com" },
  { name: "besthellos", url: "https://besthellos.com" },
  { name: "porchbound", url: "https://porchbound.us" },
  { name: "isitusa", url: "https://isitusa.com" },
  { name: "oceanbattelle", url: "https://oceanbattelle.com" },
  { name: "atlantis", url: "https://joinatlant.is" },
  { name: "profosi", url: "https://profosi.com" }
];

function roundMotionValue(value: number) {
  return Number(value.toFixed(5));
}

function getViewport() {
  if (typeof window === "undefined") {
    return { w: 1366, h: 900 };
  }

  return { w: window.innerWidth, h: window.innerHeight };
}

function getFinalPosition(index: number) {
  const angle = (index * 360) / DOT_COUNT - 90;
  const radians = (angle * Math.PI) / 180;
  return {
    x: roundMotionValue(CENTER + LOGO_RADIUS * Math.cos(radians)),
    y: roundMotionValue(CENTER + LOGO_RADIUS * Math.sin(radians))
  };
}

function getSwirlPosition(index: number) {
  const angle = (index * 360) / DOT_COUNT;
  const radians = (angle * Math.PI) / 180;
  const swirlRadius = LOGO_RADIUS * 1.5;
  return {
    x: roundMotionValue(CENTER + swirlRadius * Math.cos(radians)),
    y: roundMotionValue(CENTER + swirlRadius * Math.sin(radians))
  };
}

function getStartPosition(index: number, width: number, height: number) {
  const side = index % 4;

  if (side === 0) {
    const x = (width / DOT_COUNT) * (index + 0.5);
    return { x: roundMotionValue(x), y: -110 };
  }

  if (side === 1) {
    const y = (height / DOT_COUNT) * (index + 0.5);
    return { x: width + 110, y: roundMotionValue(y) };
  }

  if (side === 2) {
    const x = width - (width / DOT_COUNT) * (index + 0.5);
    return { x: roundMotionValue(x), y: height + 110 };
  }

  const y = height - (height / DOT_COUNT) * (index + 0.5);
  return { x: -110, y: roundMotionValue(y) };
}

export default function AnimatedLandingPage({
  hasError = false,
  errorPath,
  successPath = "/admin?welcome=1",
  showBackLink = false
}: LandingProps) {
  const reducedMotion = useReducedMotion();
  const showPortfolio = !showBackLink;
  const [animationComplete, setAnimationComplete] = useState(false);
  const [activeLogoDot, setActiveLogoDot] = useState<number | null>(null);
  const [loginOpen, setLoginOpen] = useState(hasError);
  const loginToggle = useRef<HTMLButtonElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const ready = animationComplete || Boolean(reducedMotion);
  // Keep the first client render identical to the server render. The real
  // viewport is applied immediately after hydration so the animation still
  // begins from the current window edges without producing mismatched markup.
  const [viewport, setViewport] = useState({ w: 1366, h: 900 });
  const startPositions = useMemo(
    () => DOT_COLORS.map((_, index) => getStartPosition(index, viewport.w, viewport.h)),
    [viewport.w, viewport.h]
  );

  useEffect(() => {
    function onResize() {
      setViewport(getViewport());
    }

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (showPortfolio && loginOpen && ready) passwordInput.current?.focus({ preventScroll: true });
  }, [loginOpen, ready, showPortfolio]);

  const entrance = (delay = 0) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: ready ? 1 : 0, y: ready ? 0 : 16 },
    transition: { duration: reducedMotion ? 0 : .65, delay: ready && !reducedMotion ? delay : 0 },
    style: { visibility: ready ? "visible" as const : "hidden" as const }
  });
  const signInWidth = Math.min(340, viewport.w - 64);
  const loginForm = <form action="/api/admin/login" method="post" className="landing-login-form">
    <input type="hidden" name="errorPath" value={errorPath} />
    <input type="hidden" name="successPath" value={successPath} />
    {hasError && <p className="landing-error" role="alert">Invalid password. Try again.</p>}
    <input ref={passwordInput} id="password" name="password" type="password" aria-label="Password" placeholder="password"
      className="landing-input" autoComplete="current-password" required />
    <button type="submit" className="landing-submit" aria-label="Enter" title="Enter"><IconArrowRight size={20} stroke={1.7} aria-hidden="true" /></button>
  </form>;

  return (
    <main className={`landing-root${showPortfolio ? " landing-root--portfolio" : ""}${hasError ? " landing-root--error" : ""}`}>
      <LandingPointer active={ready} />


      <div className="landing-center">
        {showBackLink && (
          <Link href="/" className="landing-back-link" style={{ visibility: ready ? "visible" : "hidden" }}>
            Back Home
          </Link>
        )}

        <div className="landing-logo-wrap" role="group" aria-label="Interactive Unigentamos logo" style={{ width: LOGO_SIZE, height: LOGO_SIZE }}>
          <div className={`landing-logo-orbit${activeLogoDot !== null ? " landing-logo-orbit--active" : ""}`}
            onAnimationEnd={(event) => { if (event.target === event.currentTarget) setActiveLogoDot(null); }}>
          {DOT_COLORS.map((color, index) => {
            const start = startPositions[index];
            const swirl = getSwirlPosition(index);
            const final = getFinalPosition(index);
            const startX = roundMotionValue(start.x - final.x);
            const startY = roundMotionValue(start.y - final.y);
            const swirlX = roundMotionValue(swirl.x - final.x);
            const swirlY = roundMotionValue(swirl.y - final.y);

            return (
              <motion.button
                key={`${color}-${index}`}
                type="button"
                className="landing-logo-dot"
                aria-label={`Animate logo dot ${index + 1}`}
                disabled={!ready}
                aria-disabled={activeLogoDot !== null}
                data-pulsing={activeLogoDot === index}
                onClick={() => { if (ready && activeLogoDot === null) setActiveLogoDot(index); }}
                style={{
                  width: roundMotionValue(DOT_RADIUS * 2),
                  height: roundMotionValue(DOT_RADIUS * 2),
                  left: roundMotionValue(final.x - DOT_RADIUS),
                  top: roundMotionValue(final.y - DOT_RADIUS),
                  backgroundColor: color
                }}
                initial={{
                  x: startX,
                  y: startY,
                  scale: 0,
                  opacity: 0
                }}
                animate={
                  animationComplete || reducedMotion
                    ? { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
                    : {
                        x: [startX, swirlX, 0],
                        y: [startY, swirlY, 0],
                        scale: [0, 1.2, 1],
                        opacity: [0, 1, 1],
                        rotate: [0, 1440, 0]
                      }
                }
                transition={{
                  duration: reducedMotion ? 0 : 2.15,
                  delay: reducedMotion ? 0 : index * 0.06,
                  ease: [0.25, 0.1, 0.25, 1],
                  times: [0, 0.5, 1]
                }}
                onAnimationComplete={() => {
                  if (index === DOT_COUNT - 1) {
                    setAnimationComplete(true);
                  }
                }}
              />
            );
          })}
          </div>
        </div>

        <motion.h1
          className="landing-title"
          {...entrance()}
        >
          <span className="landing-title-uni">Uni</span>
          <span className="landing-title-gen">gen</span>
          <span className="landing-title-ta">ta</span>
          <span className="landing-title-mos">mos</span>
        </motion.h1>

        {showPortfolio && <>
          <motion.p className="landing-description" {...entrance(.12)}>A collective of ventures, ideas, and experiences<br />working towards a better world.</motion.p>
          <motion.ul layout className={`landing-ventures${viewport.w < 900 || viewport.w / viewport.h < 1.05 ? " landing-ventures--vertical" : ""}`}
            aria-label="Our ventures, ideas, and experiences" inert={!ready} {...entrance(.24)}>
            {VENTURES.map(({ name, url }, index) => <motion.li key={name} layout
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 12 }}
              transition={{ duration: reducedMotion ? 0 : .55, delay: ready && !reducedMotion ? .26 + index * .055 : 0, layout: { duration: reducedMotion ? 0 : .5, delay: 0 } }}>
              <a href={url} className="landing-venture-name">{name}</a>
            </motion.li>)}
          </motion.ul>
        </>}
        {showPortfolio && <motion.div className="landing-signin" {...entrance(.5)} inert={!ready}
          onKeyDown={(event) => { if (event.key === "Escape") { setLoginOpen(false); loginToggle.current?.focus(); } }}>
          <motion.div className="landing-signin-controls" initial={false}
            animate={{ width: loginOpen ? signInWidth : 44, height: loginOpen && hasError ? 96 : 44 }}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 150, damping: 24, mass: .9 }}>
            <button ref={loginToggle} type="button" className="landing-signin-toggle" aria-label={loginOpen ? "Close sign in" : "Sign in"}
              aria-expanded={loginOpen} aria-controls="landing-signin-panel" onClick={() => setLoginOpen(!loginOpen)}>
              <IconLogin2 size={23} stroke={1.6} />
            </button>
            <motion.div id="landing-signin-panel" className="landing-signin-panel"
              initial={false} animate={{ opacity: ready && loginOpen ? 1 : 0, x: loginOpen ? 0 : -20, scale: loginOpen ? 1 : .95 }}
              style={{ width: signInWidth - 56, pointerEvents: ready && loginOpen ? "auto" : "none", transformOrigin: "left center" }}
              transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 150, damping: 24, mass: .9, opacity: { duration: .3, delay: loginOpen ? .1 : 0 } }}
              inert={!ready || !loginOpen} aria-hidden={!ready || !loginOpen}>
              {loginForm}
            </motion.div>
          </motion.div>
        </motion.div>}
        {!showPortfolio && <motion.div className="landing-login-shell" {...entrance(.2)} inert={!ready}>{loginForm}</motion.div>}
      </div>
    </main>
  );
}
