import type { Limb, MotionFrame, MotionRule, Point, ScenePlan } from './domain.ts';
import { solveIKPoints } from './vendor/styk-ik.mjs';
import { validateRule } from './memory.ts';

export const FLOOR_Y = 430;
const PI = Math.PI;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const pointMix = (a: Point, b: Point, t: number): Point => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });

export function durationFor(plan: ScenePlan): number {
  return (plan.distance === 'near' ? 10 : 12) * (plan.pace === 'slow' ? 1.5 : plan.pace === 'fast' ? .72 : 1);
}

function phaseAt(p: number, wave: boolean): Pick<MotionFrame, 'phase' | 'phaseProgress'> {
  if (p < .18) return { phase: 'approach', phaseProgress: p / .18 };
  if (p < .28) return { phase: 'grasp', phaseProgress: (p - .18) / .1 };
  if (p < .72) return { phase: 'carry', phaseProgress: (p - .28) / .44 };
  if (p < .86) return { phase: 'place', phaseProgress: (p - .72) / .14 };
  return wave ? { phase: 'wave', phaseProgress: (p - .86) / .14 } : { phase: 'place', phaseProgress: 1 };
}

function solveLimb(id: string, kind: Limb['kind'], rear: boolean, origin: Point, target: Point, lengths: number[], bend = 1): { limb: Limb; error: number } {
  const points = [{ ...origin }, { x: origin.x + lengths[0] * .6, y: origin.y + lengths[0] * .8 }, { ...target }];
  const result = solveIKPoints(points, lengths, target, bend);
  return { limb: { id, kind, rear, points, lengths: [...lengths] }, error: result.error };
}

function rotatedGrip(center: Point, angle: number, x: number, y: number): Point {
  return { x: center.x + Math.cos(angle) * x - Math.sin(angle) * y,
    y: center.y + Math.sin(angle) * x + Math.cos(angle) * y };
}

/**
 * A bounded choreography, evaluated from time rather than accumulated state.
 * The object is the rule's target. Each body's hands are solved onto its grips.
 * This is kinematic animation, not a dynamics or learned motion model.
 */
export function sampleMotion(plan: ScenePlan, progress: number, rule: MotionRule | null, options: { enabled?: boolean; teachingAngle?: number } = {}): MotionFrame {
  const p = Number.isFinite(progress) ? clamp(progress) : 0;
  const { phase, phaseProgress: u } = phaseAt(p, plan.wave);
  const creature = plan.actor === 'quadruped';
  const width = plan.prop === 'tray' ? 100 : 72;
  const height = plan.prop === 'tray' ? 15 : 48;
  const source: Point = { x: 330, y: 350 };
  const destination: Point = { x: plan.distance === 'near' ? 640 : 790, y: plan.destination === 'shelf' ? 315 : 330 };
  const startX = 170, pickupX = source.x - 65, endX = destination.x - 65;
  const rootX = phase === 'approach' ? mix(startX, pickupX, smooth(u)) :
    phase === 'grasp' ? pickupX : phase === 'carry' ? mix(pickupX, endX, smooth(u)) : endX;
  const moving = phase === 'approach' || phase === 'carry';
  const walkStart = phase === 'approach' ? startX : pickupX;
  const walkEnd = phase === 'approach' ? pickupX : endX;
  const stride = (walkEnd - walkStart) / Math.ceil((walkEnd - walkStart) / 50);
  const travelled = rootX - walkStart;
  const bob = moving ? Math.sin(travelled / stride * 2 * PI) ** 2 * 2 : 0;
  const root: Point = { x: rootX, y: (creature ? 352 : 350) - bob };
  const head: Point = { x: rootX + (creature ? 5 : 0), y: (creature ? 235 : 244) - bob };
  const torso: Point[] = creature
    ? [{ x: rootX - 38, y: root.y - 5 }, { x: rootX + 27, y: root.y - 5 }, { x: rootX + 30, y: root.y - 48 }, { x: rootX + 5, y: 270 - bob }]
    : [{ ...root }, { x: rootX, y: root.y - 67 }];

  const sourceCenter = { x: source.x, y: source.y - height / 2 };
  const destinationCenter = { x: destination.x, y: destination.y - height / 2 };
  // Keep the whole rotated prop above both support surfaces, including ±30°
  // teaching previews. |sin(a)| <= |a| makes this bound conservative during
  // the coupled rotation/translation of grasp and placement as well.
  const carryY = Math.min(source.y, destination.y) - height / 2 - width / 2 * (PI / 6) - 12;
  const carryCenter = { x: rootX + 65, y: carryY - bob * .45 };
  let center: Point;
  if (phase === 'approach') center = sourceCenter;
  else if (phase === 'grasp') center = pointMix(sourceCenter, carryCenter, smooth((u - .35) / .65));
  else if (phase === 'carry') center = carryCenter;
  else if (phase === 'place') center = pointMix(carryCenter, destinationCenter, smooth(u / .62));
  else center = destinationCenter;

  const validatedRule = validateRule(rule);
  const memoryEnabled = options.enabled !== false && validatedRule !== null;
  const previewAngle = typeof options.teachingAngle === 'number' && Number.isFinite(options.teachingAngle)
    ? clamp(options.teachingAngle, -PI / 6, PI / 6) : null;
  const targetAngle = previewAngle ?? (memoryEnabled ? validatedRule!.targetAngle : null);
  const baseline = phase === 'carry' ? .29 * Math.sin(u * 5 * PI) * Math.sin(u * PI) : 0;
  let angle = baseline;
  if (targetAngle !== null) {
    angle = phase === 'carry' ? targetAngle : phase === 'grasp' ? targetAngle * smooth((u - .35) / .65) :
      phase === 'place' ? targetAngle * (1 - smooth(u / .62)) : 0;
  }
  const attached = phase === 'carry' || phase === 'grasp' && u >= .35 || phase === 'place' && u <= .62;
  const handBlend = phase === 'approach' ? 0 : phase === 'grasp' ? smooth(u / .35) : phase === 'carry' ? 1 :
    phase === 'place' ? 1 - smooth((u - .62) / .38) : 0;
  const limbs: Limb[] = [];

  const legOffsets = creature ? [-33, -13, 13, 34] : [-9, 9];
  legOffsets.forEach((offset, index) => {
    const rear = creature ? index % 2 === 0 : index === 0;
    const cycleOffset = creature ? [0, .5, .5, 0][index] : [0, .5][index];
    const walkCycle = travelled / stride + cycleOffset;
    const cycleIndex = Math.floor(walkCycle + 1e-10);
    const cycle = clamp(walkCycle - cycleIndex);
    const swing = clamp((cycle - .6) / .4);
    const anchorX = walkStart + offset + cycleIndex * stride + .3 * stride - cycleOffset * stride;
    const foot = moving ? { x: anchorX + stride * smooth(swing), y: FLOOR_Y - Math.sin(PI * swing) * 16 } :
      { x: rootX + offset + (.3 - cycleOffset) * stride, y: FLOOR_Y };
    const hip = { x: rootX + offset, y: root.y - (creature ? 5 : 0) };
    limbs.push(solveLimb(`leg-${index}`, 'leg', rear, hip, foot, creature ? [51, 49] : [49, 48], rear ? -1 : 1).limb);
  });

  let gripError = 0;
  for (let i = 0; i < 2; i++) {
    const rear = i === 0;
    const shoulder = { x: rootX + (creature ? 25 + i * 6 : (rear ? -7 : 7)), y: root.y - (creature ? 48 : 67) + (rear ? 3 : 0) };
    const armSwing = moving ? Math.sin(travelled / stride * 2 * PI + i * PI) * (phase === 'carry' ? 0 : 17) : 0;
    const rest = { x: shoulder.x + (rear ? -21 : 17) + armSwing, y: shoulder.y + 80 };
    const grip = rotatedGrip(center, angle, (rear ? -.42 : .42) * width, height * .18);
    let target = pointMix(rest, grip, handBlend);
    if (phase === 'wave' && !rear) {
      const waveBlend = smooth(u / .22);
      target = pointMix(rest, { x: shoulder.x + 54 + Math.sin(u * 6 * PI) * 8, y: shoulder.y - 47 }, waveBlend);
    }
    const solved = solveLimb(`arm-${i}`, 'arm', rear, shoulder, target, creature ? [65, 65] : [70, 68], rear ? 1 : -1);
    limbs.push(solved.limb);
    if (attached) gripError = Math.max(gripError, solved.error);
  }
  return { progress: p, phase, phaseProgress: u, root, head, torso, limbs,
    prop: { center, angle, width, height, carried: attached }, source, destination,
    ruleApplied: memoryEnabled && phase === 'carry', gripError };
}

/** Independently sample the complete motion; these are measured kinematic values. */
export function measureMotion(plan: ScenePlan, rule: MotionRule | null, enabled = true): { maxTiltDegrees: number; maxGripError: number; samples: number; ruleApplied: boolean } {
  let maxTiltDegrees = 0, maxGripError = 0, ruleApplied = false;
  const samples = 241;
  for (let i = 0; i < samples; i++) {
    const frame = sampleMotion(plan, i / (samples - 1), rule, { enabled });
    if (frame.phase === 'carry') maxTiltDegrees = Math.max(maxTiltDegrees, Math.abs(frame.prop.angle) * 180 / PI);
    maxGripError = Math.max(maxGripError, frame.gripError);
    ruleApplied ||= frame.ruleApplied;
  }
  return { maxTiltDegrees, maxGripError, samples, ruleApplied };
}
