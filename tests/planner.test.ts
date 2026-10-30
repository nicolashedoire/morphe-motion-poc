import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCENE, DEFAULT_PROMPT, TRANSFER_PROMPT } from '../src/domain.ts';
import { parsePrompt, validateScenePlan, validatePlannerResult } from '../src/planner.ts';

test('default scene and transfer prompt compile to executable scene plans', () => {
  const first = parsePrompt(DEFAULT_PROMPT);
  assert.equal(first.kind, 'scene');
  if (first.kind !== 'scene') return;
  assert.equal(first.plan.actor, 'biped');
  assert.equal(first.plan.color, 'teal');
  assert.equal(first.plan.prop, 'box');
  assert.equal(first.plan.destination, 'table');
  assert.equal(first.plan.wave, true);
  assert.match(first.warnings.join(' '), /local grammar/i);
  const next = parsePrompt(TRANSFER_PROMPT, first.plan);
  assert.equal(next.kind, 'scene');
  if (next.kind !== 'scene') return;
  assert.equal(next.plan.actor, 'quadruped');
  assert.equal(next.plan.color, 'violet');
  assert.equal(next.plan.prop, 'tray');
  assert.equal(next.plan.destination, 'shelf');
});

test('French accents, transport, props, distance, pace and waving are recognized', () => {
  const result = parsePrompt('Une créature violette à quatre pattes porte un plateau lentement vers une étagère proche dans une pièce, puis salue.');
  assert.equal(result.kind, 'scene');
  if (result.kind !== 'scene') return;
  assert.deepEqual({ ...result.plan, title: '' }, {
    version: 1, actor: 'quadruped', color: 'violet', prop: 'tray', destination: 'shelf', distance: 'near', pace: 'slow', wave: true, title: '',
  });
});

test('scene edits preserve unspecified fields and do not mutate the current plan', () => {
  const current = { ...DEFAULT_SCENE, actor: 'quadruped' as const, prop: 'tray' as const, wave: false };
  const snapshot = structuredClone(current);
  for (const [prompt, key, value] of [
    ['Make it slower', 'pace', 'slow'], ['Rapproche la table', 'distance', 'near'], ['Personnage violet', 'color', 'violet'],
    ['A red box', 'color', 'coral'], ['Move faster', 'pace', 'fast'],
  ] as const) {
    const result = parsePrompt(prompt, current);
    assert.equal(result.kind, 'scene');
    if (result.kind !== 'scene') continue;
    assert.equal(result.plan[key], value);
    assert.equal(result.plan.wave, false);
    assert.equal(result.plan.destination, current.destination);
    assert.equal(result.plan.actor, current.actor);
  }
  assert.deepEqual(current, snapshot);
});

test('negated waving stays disabled in both languages', () => {
  for (const prompt of ['A blue robot carries a box, do not wave', "Don't wave", 'No waving', 'Without waving', 'Not waving', 'Sans saluer', 'Ne salue pas', 'Ne fais pas de signe', 'Sans faire de signe']) {
    const result = parsePrompt(prompt);
    assert.equal(result.kind, 'scene', prompt);
    if (result.kind === 'scene') assert.equal(result.plan.wave, false, prompt);
  }
  const positive = parsePrompt('Wave', { ...DEFAULT_SCENE, wave: false });
  assert.equal(positive.kind, 'scene');
  if (positive.kind === 'scene') assert.equal(positive.plan.wave, true);
});

test('supported level corrections create an explicit zero-angle rule request', () => {
  for (const prompt of ['Keep it horizontal', 'Keep the tray level', 'Hold the box stable', 'Garde le plateau horizontal', 'Ne penche pas', 'Ne la penche pas']) {
    const result = parsePrompt(prompt);
    assert.equal(result.kind, 'correction', prompt);
    if (result.kind === 'correction') {
      assert.equal(result.targetAngle, 0);
      assert.match(result.warnings.join(' '), /does not train/);
    }
  }
});

test('unsupported actions and anatomy never silently become a carry scene', () => {
  for (const prompt of ['A robot jumps', 'A creature flies', 'A blue robot dances', 'Un robot danse', 'Le robot nage', 'Teleport a box', 'Two robots carry a tray', 'A robot with four arms', 'Keep it upright', 'Do not carry the box', 'Ne transporte pas la boîte', 'not blue', 'Do not keep it horizontal', 'Ne garde pas le plateau horizontal', 'No wave and not blue', 'invent a galaxy', '', 'a'.repeat(1201)]) {
    assert.equal(parsePrompt(prompt).kind, 'unsupported', prompt);
  }
});

test('unfamiliar scene details produce a visible bounded-grammar warning', () => {
  const result = parsePrompt('A blue robot carries a box through a gorgeous glowing moon palace.');
  assert.equal(result.kind, 'scene');
  if (result.kind === 'scene') assert.match(result.warnings.join(' '), /Other details are not executed/);
});

test('scene validator rejects arbitrary actions, malformed types and additional keys', () => {
  for (const invalid of [null, [], {}, { ...DEFAULT_SCENE, actor: 'dragon' }, { ...DEFAULT_SCENE, wave: 'yes' },
    { ...DEFAULT_SCENE, version: 2 }, { ...DEFAULT_SCENE, title: '' }, { ...DEFAULT_SCENE, title: 'a'.repeat(101) },
    { ...DEFAULT_SCENE, action: 'eval' }, { ...DEFAULT_SCENE, title: 'bad\u0000title' }]) {
    assert.throws(() => validateScenePlan(invalid));
  }
  const validated = validateScenePlan(DEFAULT_SCENE);
  assert.deepEqual(validated, DEFAULT_SCENE);
  assert.notEqual(validated, DEFAULT_SCENE);
});

test('planner result validator rejects unbounded correction angles and malformed warnings', () => {
  const correction = { kind: 'correction', targetAngle: 0, summary: 'Keep level.', warnings: [] };
  assert.deepEqual(validatePlannerResult(correction), correction);
  for (const invalid of [{ ...correction, targetAngle: Infinity }, { ...correction, targetAngle: 2 },
    { ...correction, warnings: ['a'.repeat(301)] }, { ...correction, extra: true },
    { kind: 'unsupported', message: '' }, { kind: 'scene', plan: DEFAULT_SCENE, warnings: [] }]) {
    assert.throws(() => validatePlannerResult(invalid));
  }
});
