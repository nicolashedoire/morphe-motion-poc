export type RigKind = 'biped' | 'quadruped';
export type PropKind = 'box' | 'tray';
export type ColorName = 'teal' | 'blue' | 'coral' | 'violet';
export interface ScenePlan {
  version: 1;
  actor: RigKind;
  color: ColorName;
  prop: PropKind;
  destination: 'table' | 'shelf';
  distance: 'near' | 'far';
  pace: 'slow' | 'normal' | 'fast';
  wave: boolean;
  title: string;
}
export interface MotionRule {
  id: 'carry-level';
  version: 1;
  kind: 'orientation';
  action: 'carry';
  target: 'carried-object';
  targetAngle: number;
  tolerance: number;
  taughtOn: RigKind;
  source: 'gesture' | 'text';
  createdAt: string;
}
export interface Point { x: number; y: number; }
export interface Limb { id: string; points: Point[]; lengths: number[]; kind: 'arm' | 'leg'; rear: boolean; }
export interface MotionFrame {
  progress: number;
  phase: 'approach' | 'grasp' | 'carry' | 'place' | 'wave';
  phaseProgress: number;
  root: Point;
  head: Point;
  torso: Point[];
  limbs: Limb[];
  prop: { center: Point; angle: number; width: number; height: number; carried: boolean };
  source: Point;
  destination: Point;
  ruleApplied: boolean;
  gripError: number;
}
export const DEFAULT_SCENE: ScenePlan = { version: 1, actor: 'biped', color: 'teal', prop: 'box', destination: 'table', distance: 'far', pace: 'normal', wave: true, title: 'A little help, a lasting lesson.' };
export const DEFAULT_PROMPT = 'A teal robot carries a box to the table, sets it down, and waves.';
export const TRANSFER_PROMPT = 'A violet four-legged creature carries a tray to the shelf, sets it down, and waves.';
