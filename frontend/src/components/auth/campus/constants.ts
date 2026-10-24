import type { RGB } from "three";

export const CAMPUS_RADIUS = 60;
export const GROUND_SIZE = 200;

export interface Waypoint {
  position: [number, number, number];
  direction: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  type:
    | "academic"
    | "administration"
    | "library"
    | "student-center"
    | "faculty"
    | "sports"
    | "labs"
    | "parking"
    | "gate";
  material: "brick" | "glass" | "concrete" | "stone" | "metal";
  stories: number;
  windowLitFraction: number;
  entrance: { side: "north" | "south" | "east" | "west"; offset: number };
  roof: "flat" | "gable" | "canopy" | "sloped";
  special?: "tower" | "columns" | "atrium" | "patio" | "balconies" | "garage" | "arch";
  labelPos: [number, number, number];
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: "academic",
    name: "Academic Building",
    position: [0, 0, 0],
    size: [40, 14, 18],
    type: "academic",
    material: "glass",
    stories: 4,
    windowLitFraction: 0.4,
    entrance: { side: "north", offset: 0 },
    roof: "flat",
    special: "atrium",
    labelPos: [0, 16, 9],
  },
  {
    id: "administration",
    name: "Administration",
    position: [-8, 0, 16],
    size: [16, 10, 14],
    type: "administration",
    material: "stone",
    stories: 3,
    windowLitFraction: 0.7,
    entrance: { side: "north", offset: 0 },
    roof: "gable",
    special: "columns",
    labelPos: [-8, 12, 9],
  },
  {
    id: "library",
    name: "Central Library",
    position: [-22, 0, 2],
    size: [16, 18, 14],
    type: "library",
    material: "glass",
    stories: 5,
    windowLitFraction: 0.3,
    entrance: { side: "north", offset: 0 },
    roof: "sloped",
    labelPos: [-22, 20, 9],
  },
  {
    id: "student-center",
    name: "Student Center",
    position: [16, 0, -10],
    size: [22, 8, 16],
    type: "student-center",
    material: "brick",
    stories: 2,
    windowLitFraction: 0.6,
    entrance: { side: "north", offset: 0 },
    roof: "canopy",
    special: "patio",
    labelPos: [16, 10, -2],
  },
  {
    id: "faculty",
    name: "Faculty Office Block",
    position: [10, 0, 14],
    size: [14, 10, 12],
    type: "faculty",
    material: "brick",
    stories: 3,
    windowLitFraction: 0.5,
    entrance: { side: "north", offset: 0 },
    roof: "flat",
    special: "balconies",
    labelPos: [10, 12, 8],
  },
  {
    id: "sports",
    name: "Sports Complex",
    position: [0, 0, 24],
    size: [30, 9, 18],
    type: "sports",
    material: "metal",
    stories: 1,
    windowLitFraction: 0.1,
    entrance: { side: "north", offset: 0 },
    roof: "canopy",
    labelPos: [0, 11, 15],
  },
  {
    id: "labs",
    name: "Engineering Labs",
    position: [-14, 0, -12],
    size: [12, 8, 10],
    type: "labs",
    material: "concrete",
    stories: 2,
    windowLitFraction: 0.35,
    entrance: { side: "north", offset: 0 },
    roof: "flat",
    labelPos: [-14, 10, -7],
  },
  {
    id: "parking",
    name: "Parking Structure",
    position: [14, 0, -20],
    size: [24, 8, 12],
    type: "parking",
    material: "concrete",
    stories: 3,
    windowLitFraction: 0.2,
    entrance: { side: "south", offset: -4 },
    roof: "flat",
    special: "garage",
    labelPos: [14, 10, -14],
  },
  {
    id: "gate",
    name: "Main Gate",
    position: [0, 0, -30],
    size: [8, 4, 2],
    type: "gate",
    material: "stone",
    stories: 1,
    windowLitFraction: 0.8,
    entrance: { side: "south", offset: 0 },
    roof: "flat",
    special: "arch",
    labelPos: [0, 5, -29],
  },
];

export const SHUTTLE_ROUTE: Waypoint[] = [
  { position: [0, 0, -28], direction: 0 },
  { position: [-8, 0, 14], direction: 0.3 },
  { position: [0, 0, 0], direction: 0.6 },
  { position: [-22, 0, 2], direction: 1.0 },
  { position: [16, 0, -10], direction: 1.6 },
  { position: [0, 0, 24], direction: 2.1 },
  { position: [0, 0, -28], direction: 3.14 },
];

export const DELIVERY_PATH: Waypoint[] = [
  { position: [0, 0, -28], direction: 0 },
  { position: [14, 0, -18], direction: 0.5 },
  { position: [16, 0, -10], direction: 0.8 },
  { position: [16, 0, -20], direction: 1.0 },
];

export const DELIVERY_PARKING_POS: [number, number, number] = [16, 0, -18];
export const DELIVERY_WAIT_DURATION = 14000;
export const DELIVERY_CYCLE = 70000;

export type CharacterType = "student" | "faculty" | "security" | "maintenance";
export type VehicleType = "car" | "shuttle" | "delivery";

export interface CharacterPreset {
  type: CharacterType;
  height: number;
  shirtColors: string[];
  pantsColors: string[];
  accessories: string[];
  walkSpeed: [number, number];
  baseColor: string;
}

export interface VehiclePreset {
  type: VehicleType;
  name: string;
  color: string;
}

export const CHARACTER_PRESETS: Record<CharacterType, CharacterPreset> = {
  student: {
    type: "student",
    height: 1.72,
    shirtColors: ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#0891b2", "#ea580c", "#475569"],
    pantsColors: ["#1e293b", "#1e3a8a", "#0f766e", "#78350f"],
    accessories: ["backpack", "backpack", "bag", "none", "none"],
    walkSpeed: [2.2, 2.8],
    baseColor: "#f8fafc",
  },
  faculty: {
    type: "faculty",
    height: 1.76,
    shirtColors: ["#0f172a", "#3730a3", "#7c2d12"],
    pantsColors: ["#0f172a", "#1e293b", "#78350f"],
    accessories: ["briefcase", "bag", "none"],
    walkSpeed: [1.6, 2.0],
    baseColor: "#ffffff",
  },
  security: {
    type: "security",
    height: 1.74,
    shirtColors: ["#1e293b", "#0f172a"],
    pantsColors: ["#1e293b", "#0f172a"],
    accessories: ["vest", "cap"],
    walkSpeed: [1.4, 1.8],
    baseColor: "#ffffff",
  },
  maintenance: {
    type: "maintenance",
    height: 1.70,
    shirtColors: ["#ca8a04", "#92400e"],
    pantsColors: ["#92400e", "#1e293b"],
    accessories: ["toolbelt", "cap"],
    walkSpeed: [1.3, 1.7],
    baseColor: "#ffffff",
  },
};

export const VEHICLE_PRESETS: VehiclePreset[] = [
  { type: "car", name: "Sedan", color: "#1e3a8a" },
  { type: "car", name: "SUV", color: "#0f766e" },
  { type: "car", name: "Hatchback", color: "#7c2d12" },
  { type: "car", name: "Coupe", color: "#5821b4" },
  { type: "car", name: "Sedan", color: "#991b1b" },
  { type: "car", name: "SUV", color: "#374151" },
  { type: "car", name: "Wagon", color: "#0369a8" },
  { type: "car", name: "Pickup", color: "#ca8a04" },
  { type: "shuttle", name: "Campus Shuttle", color: "#0d6e6e" },
  { type: "delivery", name: "Delivery Truck", color: "#eab308" },
];

export const CAR_SPAWN_POINTS: Waypoint[] = [
  { position: [22, 0, -5], direction: 0 },
  { position: [-22, 0, -5], direction: Math.PI },
  { position: [5, 0, 26], direction: Math.PI / 2 },
  { position: [5, 0, -26], direction: -Math.PI / 2 },
];

export const CAR_PATHS: Waypoint[][] = [
  [
    { position: [22, 0, -5], direction: 0 },
    { position: [8, 0, -5], direction: 0.2 },
    { position: [0, 0, -5], direction: 0.4 },
    { position: [-22, 0, -5], direction: 0.6 },
    { position: [-22, 0, 8], direction: 0.9 },
    { position: [-22, 0, -5], direction: 1.5 },
    { position: [22, 0, -5], direction: 2 },
  ],
  [
    { position: [5, 0, 26], direction: Math.PI / 2 },
    { position: [5, 0, 16], direction: Math.PI / 2 },
    { position: [0, 0, 16], direction: Math.PI / 2 + 0.3 },
    { position: [0, 0, -10], direction: Math.PI / 2 + 0.6 },
    { position: [12, 0, -10], direction: 1.0 },
    { position: [12, 0, 26], direction: 1.5 },
    { position: [5, 0, 26], direction: 2.0 },
  ],
];

export const SECURITY_PATROLS: Waypoint[][] = [
  [
    { position: [0, 0, -30], direction: 0 },
    { position: [-2, 0, -30], direction: 0.2 },
    { position: [2, 0, -30], direction: 0.8 },
    { position: [-2, 0, -30], direction: 1.5 },
    { position: [0, 0, -30], direction: 2.0 },
  ],
  [
    { position: [0, 0, 24], direction: 0.5 },
    { position: [-6, 0, 18], direction: 0.8 },
    { position: [6, 0, 18], direction: 1.2 },
    { position: [0, 0, 24], direction: 1.8 },
  ],
];

export const PEDESTRIAN_PATHS: Waypoint[][] = [
  [{ position: [0, 0, -28], direction: 0 }, { position: [0, 0, 0], direction: 0.4 }, { position: [-22, 0, 2], direction: 0.8 }],
  [{ position: [22, 0, -12], direction: 2 }, { position: [0, 0, 0], direction: 2.5 }, { position: [-22, 0, 2], direction: 3 }],
  [{ position: [16, 0, -10], direction: 1.2 }, { position: [0, 0, 0], direction: 1.8 }, { position: [0, 0, 24], direction: 2.2 }],
  [{ position: [0, 0, -28], direction: 0.2 }, { position: [10, 0, 14], direction: 0.8 }, { position: [0, 0, 24], direction: 1.4 }],
  [{ position: [-14, 0, -12], direction: 0 }, { position: [0, 0, 0], direction: 0.3 }, { position: [16, 0, -10], direction: 0.9 }],
  [{ position: [0, 0, -28], direction: 0 }, { position: [16, 0, -10], direction: 0.6 }, { position: [16, 0, 18], direction: 1.0 }, { position: [0, 0, 24], direction: 1.5 }],
  [{ position: [-8, 0, 16], direction: 0.2 }, { position: [0, 0, 0], direction: 0.5 }, { position: [14, 0, -20], direction: 0.8 }, { position: [16, 0, -10], direction: 1.1 }],
];

export const BUILDING_ENTRANCES: Record<string, [number, number, number]> = {
  academic: [0, 0, 0],
  administration: [-8, 0, 12],
  library: [-22, 0, -5],
  "student-center": [16, 0, -2],
  faculty: [10, 0, 8],
  sports: [0, 0, 15],
  labs: [-14, 0, -7],
  parking: [20, 0, -14],
};

export const BENCH_POSITIONS: [number, number, number][] = [
  [0, 0, -4],
  [-10, 0, 2],
  [8, 0, 10],
  [-16, 0, -8],
  [12, 0, -18],
  [0, 0, 10],
];

export type TimeOfDay = "day" | "evening" | "night";

export interface TimeOfDayConfig {
  type: TimeOfDay;
  sunColor: string;
  sunIntensity: number;
  skyColor: string;
  ambientColor: string;
  ambientIntensity: number;
  buildingLightFraction: number;
  streetLightOn: boolean;
  name: string;
}

export const TIME_CONFIGS: Record<TimeOfDay, TimeOfDayConfig> = {
  day: {
    type: "day",
    sunColor: "#ffffff",
    sunIntensity: 1.2,
    skyColor: "#87ceeb",
    ambientColor: "#b3d9e6",
    ambientIntensity: 0.4,
    buildingLightFraction: 0.15,
    streetLightOn: false,
    name: "Day",
  },
  evening: {
    type: "evening",
    sunColor: "#ffd28d",
    sunIntensity: 0.6,
    skyColor: "#4a5d7d",
    ambientColor: "#a08460",
    ambientIntensity: 0.5,
    buildingLightFraction: 0.55,
    streetLightOn: true,
    name: "Evening",
  },
  night: {
    type: "night",
    sunColor: "#ffffff",
    sunIntensity: 0.05,
    skyColor: "#1a1f2e",
    ambientColor: "#2a364a",
    ambientIntensity: 0.25,
    buildingLightFraction: 0.85,
    streetLightOn: true,
    name: "Night",
  },
};

export const SKIN_COLORS: string[] = ["#FDBCB4", "#FFD1B3", "#F0C6A4", "#E8B896", "#F6D1A6", "#E6B896", "#FDB6B6"];

export const HAIR_COLORS: string[] = ["#3a2a1a", "#5d4037", "#1a1a1a", "#8d6e64", "#5d4037", "#3e2723", "#795548"];

const rand = (n: number) => Math.floor(Math.random() * n);

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpColor(a: string, b: string, t: number): string {
  const ha = parseInt(a.slice(1), 16);
  const hb = parseInt(b.slice(1), 16);
  const r = Math.round(((ha >> 16) & 255) + (((hb >> 16) & 255) - ((ha >> 16) & 255)) * t);
  const g = Math.round(((ha >> 8) & 255) + (((hb >> 8) & 255) - ((ha >> 8) & 255)) * t);
  const b2 = Math.round((ha & 255) + ((hb & 255) - (ha & 255)) * t);
  return `rgb(${r},${g},${b2})`;
}

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function pickSeeded<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seededRandom(seed) * arr.length)];
}

export const LOAD_PHASES = ["ground", "buildings", "roads", "vegetation", "characters", "complete"] as const;
export type LoadPhase = (typeof LOAD_PHASES)[number];
