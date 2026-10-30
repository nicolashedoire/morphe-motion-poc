/*
 * Pure inverse-kinematics functions from StykAnimate.
 * Copyright StykAnimate contributors. GPL-3.0-or-later.
 * Source: https://github.com/filippocalippo/StykAnimate-App/blob/def97214c2b491fbce82647f625a73f78416c6d8/src/ik.mjs
 * Extracted without changes to either function body. See NOTICE and LICENSE.
 */
const EPS = 1e-10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A small, serializable continuity reference; no renderer-owned solver history. */
export function ikBendReference(points, lengths, previous) {
  const base = points[0], end = points.at(-1), dx = end.x - base.x, dy = end.y - base.y;
  const total = lengths.reduce((a, b) => a + b, 0), distance = Math.hypot(dx, dy);
  let cross = 0, pole = points[1] ?? end;
  for (let i = 1; i < points.length - 1; i++) {
    const value = dx * (points[i].y - base.y) - dy * (points[i].x - base.x);
    if (Math.abs(value) > Math.abs(cross)) { cross = value; pole = points[i]; }
  }
  return {side: Math.abs(cross) > total * total * 1e-7 ? Math.sign(cross) : previous?.side ?? 1,
    angle: Math.hypot(pole.x - base.x, pole.y - base.y) > EPS ? Math.atan2(pole.y - base.y, pole.x - base.x) : previous?.angle ?? 0,
    axis: distance > EPS ? Math.atan2(dy, dx) : previous?.axis ?? 0,
    ratio: total > EPS ? distance / total : 0,
    ...(lengths.length > 2 ? {shape: lengths.map((_, i) => Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x))} : {})};
}

/** Pure point solver. Writes only caller-owned scratch points, never changes lengths. */
export function solveIKPoints(points, lengths, target, bendDirection = 1, {iterations = 32, tolerance = 1e-5, bendReference} = {}) {
  const n = lengths.length, base = {...points[0]}, total = lengths.reduce((a, b) => a + b, 0);
  if (!n || total < EPS) return {iterations: 0, error: Math.hypot(target.x - base.x, target.y - base.y)};
  const automatic = bendDirection === 0, reference = automatic ? bendReference ?? ikBendReference(points, lengths) : null;
  // Canvas/world conversion and native float32 poses introduce tiny offsets at
  // a folded endpoint. Their atan2 is essentially random; treat them as zero.
  const foldTolerance = automatic ? Math.max(EPS, total * 1e-6) : EPS;
  // Longer chains have many valid shapes. Continue from their last solved
  // chord directions instead of restarting FABRIK from the original rig pose.
  if (n > 2 && reference?.shape?.length === n) for (let i = 0; i < n; i++)
    points[i + 1] = {x: points[i].x + Math.cos(reference.shape[i]) * lengths[i], y: points[i].y + Math.sin(reference.shape[i]) * lengths[i]};
  let dx = target.x - base.x, dy = target.y - base.y, distance = Math.hypot(dx, dy);
  const fallback = reference?.axis ?? Math.atan2(points[n].y - base.y, points[n].x - base.x);
  const direction = distance > foldTolerance ? Math.atan2(dy, dx) : fallback;
  const ux = Math.cos(direction), uy = Math.sin(direction);
  // Preserve the branch of the solved limb, not the side of the old knee
  // relative to each new mouse position (which mirrors an otherwise bent limb).
  if (automatic) bendDirection = reference.side;
  let used = 0;
  if (distance >= total - EPS || n === 1) {
    for (let i = 0; i < n; i++) points[i + 1] = {x: points[i].x + ux * lengths[i], y: points[i].y + uy * lengths[i]};
  } else if (n === 2 && lengths[0] > EPS && lengths[1] > EPS) {
    const [a, b] = lengths, d = clamp(distance, Math.abs(a - b), a + b);
    const along = d > EPS ? (a * a - b * b + d * d) / (2 * d) : 0;
    const magnitude = Math.sqrt(Math.max(0, a * a - along * along));
    if (automatic) {
      // Consider the other branch only where it can preserve continuity:
      // near extension, or when the target path passes through the folded region.
      const oldX = Math.cos(reference.axis) * reference.ratio * total, oldY = Math.sin(reference.axis) * reference.ratio * total;
      const vx = dx - oldX, vy = dy - oldY, travel2 = vx * vx + vy * vy;
      const t = travel2 > EPS ? clamp(-(oldX * vx + oldY * vy) / travel2, 0, 1) : 0;
      const throughFold = Math.hypot(oldX + t * vx, oldY + t * vy) < total * .04 && oldX * dx + oldY * dy <= 0;
      if (magnitude < total * .02 || throughFold) {
        const poleX = Math.cos(reference.angle), poleY = Math.sin(reference.angle);
        // Difference in squared knee travel, normalized by link length. A dead
        // band prevents floating-point noise or subpixel motion flipping sides.
        const improvement = -4 * magnitude / a * bendDirection * (-uy * poleX + ux * poleY);
        if (improvement > .002) bendDirection = -bendDirection;
      }
      if (distance <= foldTolerance && Math.abs(a - b) < EPS) {
        // Use the limit of the approaching branch. Reusing the earlier bent
        // knee angle would jump at an exact-zero sample during random seeking.
        const angle = reference.ratio > 1e-6 ? reference.axis + reference.side * Math.PI / 2 : reference.angle;
        points[1] = {x: base.x + Math.cos(angle) * a, y: base.y + Math.sin(angle) * a};
        points[2] = {...base};
        return {iterations: 0, error: distance, bendReference: {...reference, angle, ratio: 0}};
      }
    }
    const height = magnitude * bendDirection;
    points[1] = {x: base.x + ux * along - uy * height, y: base.y + uy * along + ux * height};
    points[2] = {x: base.x + ux * d, y: base.y + uy * d};
  } else {
    let greatest = 0;
    for (const p of points.slice(1, -1)) {
      const side = ux * (p.y - base.y) - uy * (p.x - base.x);
      if (Math.abs(side) > Math.abs(greatest)) greatest = side;
    }
    const error = Math.hypot(points[n].x - target.x, points[n].y - target.y);
    if ((automatic || greatest * bendDirection >= 0) && error <= tolerance)
      return {iterations: 0, error, ...(automatic ? {bendReference: ikBendReference(points, lengths, reference)} : {})};
    // FABRIK already follows its input pose. Both must not reflect the whole
    // chain just because its target crosses the old pose's axis.
    if (!automatic && greatest * bendDirection < -total * 1e-7) for (let i = 1; i < n; i++) {
      const side = ux * (points[i].y - base.y) - uy * (points[i].x - base.x);
      points[i] = {x: points[i].x + 2 * uy * side, y: points[i].y - 2 * ux * side};
    }
    // A perfectly straight chain cannot escape the collinear FABRIK singularity.
    // Seed a small deterministic bend, preserving the user's chosen side.
    const cross = points.slice(1, -1).some(p => Math.abs((p.x - base.x) * uy - (p.y - base.y) * ux) > total * 1e-7);
    if (!cross) for (let i = 1; i < n; i++) {
      const offset = Math.sin(Math.PI * i / n) * total * .05 * bendDirection;
      points[i] = {x: points[i].x - uy * offset, y: points[i].y + ux * offset};
    }
    const place = (i, anchor, length, fallbackX, fallbackY) => {
      const p = points[i], vx = p.x - anchor.x, vy = p.y - anchor.y, d = Math.hypot(vx, vy);
      points[i] = {x: anchor.x + (d > EPS ? vx / d : fallbackX) * length,
        y: anchor.y + (d > EPS ? vy / d : fallbackY) * length};
    };
    for (; used < iterations; used++) {
      points[n] = {...target};
      for (let i = n - 1; i >= 0; i--) place(i, points[i + 1], lengths[i], -ux, -uy);
      points[0] = {...base};
      for (let i = 0; i < n; i++) place(i + 1, points[i], lengths[i], ux, uy);
      if (Math.hypot(points[n].x - target.x, points[n].y - target.y) <= tolerance) { used++; break; }
    }
  }
  return {iterations: used, error: Math.hypot(points[n].x - target.x, points[n].y - target.y),
    ...(automatic ? {bendReference: ikBendReference(points, lengths, {...reference, side: bendDirection})} : {})};
}
