import type { MotionRule, RigKind } from './domain.ts';

export const MEMORY_KEY = 'morphe.motion-memory.v1';
export interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A deliberately small, inspectable symbolic rule. No model weights are changed. */
export function makeRule({ actor, source, targetAngle = 0 }: {
  actor: RigKind; source: 'gesture' | 'text'; targetAngle?: number;
}): MotionRule {
  if (!['biped', 'quadruped'].includes(actor) || !['gesture', 'text'].includes(source))
    throw new Error('Unsupported teaching source or body.');
  if (!Number.isFinite(targetAngle)) throw new Error('The correction must be a finite angle.');
  return {
    id: 'carry-level', version: 1, kind: 'orientation', action: 'carry',
    target: 'carried-object', targetAngle: Math.max(-Math.PI / 6, Math.min(Math.PI / 6, targetAngle)),
    tolerance: 4 * Math.PI / 180, taughtOn: actor, source, createdAt: new Date().toISOString(),
  };
}

export function validateRule(value: unknown): MotionRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const valid = r.id === 'carry-level' && r.version === 1 && r.kind === 'orientation' &&
    r.action === 'carry' && r.target === 'carried-object' &&
    (r.taughtOn === 'biped' || r.taughtOn === 'quadruped') &&
    (r.source === 'gesture' || r.source === 'text') &&
    typeof r.targetAngle === 'number' && Number.isFinite(r.targetAngle) && Math.abs(r.targetAngle) <= Math.PI / 6 &&
    typeof r.tolerance === 'number' && Number.isFinite(r.tolerance) && r.tolerance > 0 && r.tolerance <= Math.PI / 12 &&
    typeof r.createdAt === 'string' && Number.isFinite(Date.parse(r.createdAt));
  if (!valid) return null;
  // Publish only known fields; imported metadata cannot become application state.
  const { id, version, kind, action, target, targetAngle, tolerance, taughtOn, source, createdAt } = r as unknown as MotionRule;
  return { id, version, kind, action, target, targetAngle, tolerance, taughtOn, source, createdAt };
}

export function loadMemory(storage: MemoryStorage): MotionRule | null {
  try {
    const text = storage.getItem(MEMORY_KEY);
    if (!text || text.length > 4096) return null;
    const value: unknown = JSON.parse(text);
    return validateRule(value);
  } catch { return null; }
}

export function saveMemory(storage: MemoryStorage, rule: MotionRule): boolean {
  const valid = validateRule(rule);
  if (!valid) return false;
  try { storage.setItem(MEMORY_KEY, JSON.stringify(valid)); return true; }
  catch { return false; }
}

export function forgetMemory(storage: MemoryStorage): boolean {
  try { storage.removeItem(MEMORY_KEY); return true; }
  catch { return false; }
}
