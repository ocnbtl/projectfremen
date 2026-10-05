export const TRAVEL_MODES = [
  { value: "car", label: "Car", icon: "car" },
  { value: "van", label: "Van", icon: "travel-van" },
  { value: "plane", label: "Plane", icon: "travel-plane" },
  { value: "train", label: "Train", icon: "travel-train" },
  { value: "boat", label: "Boat", icon: "travel-boat" },
  { value: "bus", label: "Bus", icon: "travel-bus" },
  { value: "bike", label: "Bike", icon: "travel-bike" },
  { value: "walk", label: "Walk", icon: "walk" },
  { value: "other", label: "Other", icon: "travel" },
] as const;
export const TRAVEL_MODE_VALUES = TRAVEL_MODES.map(mode => mode.value);
export function supportsTripRouting(mode: string) { return ["car", "van", "bike", "walk"].includes(mode); }
