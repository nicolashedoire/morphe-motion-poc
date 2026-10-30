import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCENE } from '../src/domain.ts';
import type { Point, ScenePlan } from '../src/domain.ts';
import { durationFor, FLOOR_Y, measureMotion, sampleMotion } from '../src/motion.ts';
import { makeRule } from '../src/memory.ts';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (actual: number, expected: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const plans: ScenePlan[] = [];
for (const actor of ['biped', 'quadruped'] as const)
  for (const prop of ['box', 'tray'] as const)
    for (const destination of ['table', 'shelf'] as const)
      for (const route of ['near', 'far'] as const)
        plans.push({ ...DEFAULT_SCENE, actor, prop, destination, distance: route });

test('both body topologies keep bone lengths and exact grips across every supported scene', () => {
  for (const plan of plans) {
    for (const targetAngle of [-Math.PI / 6, 0, Math.PI / 6]) {
      const rule = makeRule({ actor: 'biped', source: 'gesture', targetAngle });
      for (let i = 0; i <= 240; i++) {
        const frame = sampleMotion(plan, i / 240, rule);
        assert.equal(frame.limbs.filter(limb => limb.kind === 'leg').length, plan.actor === 'biped' ? 2 : 4);
        assert.equal(frame.limbs.filter(limb => limb.kind === 'arm').length, 2);
        for (const limb of frame.limbs) {
          for (let bone = 0; bone < limb.lengths.length; bone++) {
            near(distance(limb.points[bone], limb.points[bone + 1]), limb.lengths[bone]);
          }
          if (limb.kind === 'leg') assert.ok(limb.points.at(-1)!.y <= FLOOR_Y + 1e-7);
          if (frame.prop.carried && limb.kind === 'arm') {
            const { center, width, height, angle } = frame.prop;
            const localX = (limb.rear ? -.42 : .42) * width;
            const localY = height * .18;
            const expected = { x: center.x + Math.cos(angle) * localX - Math.sin(angle) * localY,
              y: center.y + Math.sin(angle) * localX + Math.cos(angle) * localY };
            near(distance(limb.points.at(-1)!, expected), 0);
          }
        }
        // Each gait has at least one load-bearing foot; none pass through the floor.
        assert.ok(frame.limbs.some(limb => limb.kind === 'leg' && Math.abs(limb.points.at(-1)!.y - FLOOR_Y) < 1e-7));
        assert.ok(frame.gripError < 1e-7);
      }
    }
  }
});

test('stance feet stay planted while the root moves', () => {
  const first = sampleMotion(DEFAULT_SCENE, .30, null);
  const later = sampleMotion(DEFAULT_SCENE, .301, null);
  assert.ok(distance(first.root, later.root) > 0);
  const planted = first.limbs.filter(limb => limb.kind === 'leg' && limb.points.at(-1)!.y === FLOOR_Y);
  assert.ok(planted.length > 0);
  for (const limb of planted) {
    const end = later.limbs.find(other => other.id === limb.id)!.points.at(-1)!;
    if (end.y === FLOOR_Y) near(distance(limb.points.at(-1)!, end), 0);
  }
});

test('one semantic correction transfers unchanged to another body and prop', () => {
  const rule = makeRule({ actor: 'biped', source: 'text', targetAngle: 0 });
  const original = JSON.stringify(rule);
  for (const plan of plans) {
    const baseline = measureMotion(plan, null);
    const corrected = measureMotion(plan, rule);
    const disabled = measureMotion(plan, rule, false);
    assert.ok(baseline.maxTiltDegrees > 14 && baseline.maxTiltDegrees < 18);
    assert.ok(corrected.maxTiltDegrees < 1e-7);
    assert.ok(corrected.maxGripError < 1e-7);
    assert.equal(corrected.ruleApplied, true);
    assert.equal(disabled.ruleApplied, false);
    near(disabled.maxTiltDegrees, baseline.maxTiltDegrees);
    assert.equal(corrected.samples, 241);
  }
  assert.equal(JSON.stringify(rule), original);
  assert.equal(rule.taughtOn, 'biped');
});

test('correction blends in and out without changing the approach or deposited object', () => {
  const rule = makeRule({ actor: 'quadruped', source: 'gesture', targetAngle: .25 });
  for (const plan of plans) {
    for (const progress of [0, .1, .18, .21, .82, .86, .95, 1]) {
      const frame = sampleMotion(plan, progress, rule);
      assert.equal(frame.ruleApplied, false);
      near(frame.prop.angle, 0);
    }
    for (const boundary of [.18, .28, .72, .86]) {
      const before = sampleMotion(plan, boundary - 1e-8, rule);
      const after = sampleMotion(plan, boundary + 1e-8, rule);
      near(before.prop.angle, after.prop.angle, 1e-5);
      near(distance(before.prop.center, after.prop.center), 0, 1e-4);
      near(distance(before.root, after.root), 0, 1e-4);
    }
    near(sampleMotion(plan, .5, rule).prop.angle, .25);
  }
});

test('objects begin on the source and finish level on the selected destination', () => {
  for (const plan of plans) {
    const first = sampleMotion(plan, 0, null);
    const last = sampleMotion(plan, 1, null);
    near(first.prop.center.x, first.source.x);
    near(first.prop.center.y + first.prop.height / 2, first.source.y);
    near(last.prop.center.x, last.destination.x);
    near(last.prop.center.y + last.prop.height / 2, last.destination.y);
    near(last.prop.angle, 0);
    assert.equal(last.prop.carried, false);
    assert.equal(last.phase, 'wave');
    const quiet = sampleMotion({ ...plan, wave: false }, 1, null);
    assert.equal(quiet.phase, 'place');
    assert.deepEqual(quiet.prop, last.prop);
  }
});

test('rotated props clear their support surfaces throughout lifting, carrying and placing', () => {
  for (const plan of plans) {
    for (const angle of [null, -Math.PI / 6, 0, Math.PI / 6]) {
      const rule = angle === null ? null : makeRule({ actor: 'biped', source: 'gesture', targetAngle: angle });
      for (let i = 0; i <= 400; i++) {
        const frame = sampleMotion(plan, i / 400, rule);
        const { center, width, height, angle: rotation } = frame.prop;
        const bottom = center.y + Math.abs(Math.sin(rotation)) * width / 2 + Math.abs(Math.cos(rotation)) * height / 2;
        if (frame.phase === 'approach' || frame.phase === 'grasp') {
          assert.ok(bottom <= frame.source.y + 1e-7, `Prop penetrates source in ${frame.phase}`);
        } else {
          assert.ok(bottom <= frame.destination.y + 1e-7, `Prop penetrates ${plan.destination} in ${frame.phase}`);
        }
      }
    }
  }
});

test('playback is deterministic, bounded and pace affects duration rather than pose', () => {
  assert.deepEqual(sampleMotion(DEFAULT_SCENE, .53, null), sampleMotion(DEFAULT_SCENE, .53, null));
  assert.deepEqual(sampleMotion(DEFAULT_SCENE, -3, null), sampleMotion(DEFAULT_SCENE, 0, null));
  assert.deepEqual(sampleMotion(DEFAULT_SCENE, 3, null), sampleMotion(DEFAULT_SCENE, 1, null));
  assert.deepEqual(sampleMotion(DEFAULT_SCENE, NaN, null), sampleMotion(DEFAULT_SCENE, 0, null));
  assert.equal(durationFor(DEFAULT_SCENE), 12);
  assert.ok(durationFor({ ...DEFAULT_SCENE, pace: 'slow' }) > durationFor(DEFAULT_SCENE));
  assert.ok(durationFor({ ...DEFAULT_SCENE, pace: 'fast' }) < durationFor(DEFAULT_SCENE));
  assert.ok(durationFor({ ...DEFAULT_SCENE, distance: 'near' }) < durationFor(DEFAULT_SCENE));
  assert.deepEqual(sampleMotion({ ...DEFAULT_SCENE, pace: 'fast' }, .4, null), sampleMotion(DEFAULT_SCENE, .4, null));
});

test('teaching preview is temporary and invalid rules do not drive motion', () => {
  const preview = sampleMotion(DEFAULT_SCENE, .5, null, { teachingAngle: .1 });
  near(preview.prop.angle, .1);
  assert.equal(preview.ruleApplied, false);
  near(sampleMotion(DEFAULT_SCENE, .5, null, { teachingAngle: 99 }).prop.angle, Math.PI / 6);
  const invalid = { ...makeRule({ actor: 'biped', source: 'text' }), targetAngle: NaN };
  assert.deepEqual(sampleMotion(DEFAULT_SCENE, .5, invalid), sampleMotion(DEFAULT_SCENE, .5, null));
});
