/** Authored motion for the internal product. Durations are seconds for Motion. */
export const motionTokens = {
  press: 0.08,
  quick: 0.12,
  standard: 0.18,
  panel: 0.26,
  context: 0.32,
  map: 0.45,
  arrive: [0.22, 1, 0.36, 1] as const,
  settle: { type: "spring" as const, stiffness: 420, damping: 38, mass: 0.8 },
};
