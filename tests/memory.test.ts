import test from 'node:test';
import assert from 'node:assert/strict';
import type { MotionRule } from '../src/domain.ts';
import { forgetMemory, loadMemory, makeRule, MEMORY_KEY, saveMemory, validateRule } from '../src/memory.ts';
import type { MemoryStorage } from '../src/memory.ts';

function memoryStorage(): MemoryStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}

test('teaching records an inspectable rule, bounded angle, provenance and timestamp', () => {
  const before = Date.now();
  const rule = makeRule({ actor: 'biped', source: 'gesture', targetAngle: 0 });
  assert.equal(rule.action, 'carry');
  assert.equal(rule.target, 'carried-object');
  assert.equal(rule.taughtOn, 'biped');
  assert.equal(rule.source, 'gesture');
  assert.equal(rule.tolerance, 4 * Math.PI / 180);
  assert.ok(Date.parse(rule.createdAt) >= before && Date.parse(rule.createdAt) <= Date.now());
  assert.equal(makeRule({ actor: 'quadruped', source: 'text', targetAngle: 100 }).targetAngle, Math.PI / 6);
  assert.equal(makeRule({ actor: 'quadruped', source: 'text', targetAngle: -100 }).targetAngle, -Math.PI / 6);
  assert.throws(() => makeRule({ actor: 'biped', source: 'text', targetAngle: NaN }));
});

test('memory survives a new reader and forgetting only removes the owned key', () => {
  const storage = memoryStorage();
  storage.setItem('unrelated', 'preserve me');
  assert.equal(loadMemory(storage), null);
  const rule = makeRule({ actor: 'biped', source: 'text', targetAngle: -.2 });
  assert.equal(saveMemory(storage, rule), true);
  assert.deepEqual(loadMemory(storage), rule);
  assert.deepEqual(loadMemory({ ...storage }), rule);
  assert.equal(forgetMemory(storage), true);
  assert.equal(loadMemory(storage), null);
  assert.equal(storage.getItem('unrelated'), 'preserve me');
});

test('schema rejects corrupt, unsupported and non-finite imported rules', () => {
  const rule = makeRule({ actor: 'biped', source: 'text' });
  const invalid: unknown[] = [null, undefined, [], 'rule', 1,
    ...Object.keys(rule).map(key => Object.fromEntries(Object.entries(rule).filter(([name]) => name !== key))),
    { ...rule, version: 2 }, { ...rule, action: 'walk' }, { ...rule, target: 'character' },
    { ...rule, targetAngle: Infinity }, { ...rule, targetAngle: .6 },
    { ...rule, tolerance: 0 }, { ...rule, tolerance: -1 }, { ...rule, tolerance: NaN },
    { ...rule, taughtOn: 'unknown' }, { ...rule, source: 'external' }, { ...rule, createdAt: 'bad date' }];
  const storage = memoryStorage();
  for (const value of invalid) {
    assert.equal(validateRule(value), null);
    assert.equal(saveMemory(storage, value as MotionRule), false);
  }
  for (const text of ['{', 'null', '[]', '{}', 'x'.repeat(5000)]) {
    storage.setItem(MEMORY_KEY, text);
    assert.equal(loadMemory(storage), null);
  }
});

test('unknown imported fields are stripped and storage denial is recoverable', () => {
  const rule = makeRule({ actor: 'quadruped', source: 'gesture' });
  assert.deepEqual(validateRule({ ...rule, untrustedExtra: 'do not retain' }), rule);
  const storage = memoryStorage();
  storage.setItem(MEMORY_KEY, JSON.stringify({ ...rule, untrustedExtra: 12 }));
  assert.deepEqual(loadMemory(storage), rule);
  const denied: MemoryStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(loadMemory(denied), null);
  assert.equal(saveMemory(denied, rule), false);
  assert.equal(forgetMemory(denied), false);
});
