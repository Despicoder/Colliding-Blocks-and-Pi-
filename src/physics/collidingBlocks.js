export function simulateCollisions({
  m1 = 1,
  m2 = 100,
  x1 = 2,
  x2 = 5,
  v1 = 0,
  v2 = -1,
  size1 = 1,
  size2 = 2,
  maxCollisions = 5_000_000,
  maxTime = 1e9,
}) {
  let t = 0;
  let collisions = 0;
  const EPS = 1e-12;

  const timeToWall = () => {
    if (v1 >= 0) return Infinity;
    return (0 - x1) / v1; // v1 negative => dt positive
  };

  const timeToBlock = () => {
    const gap = x2 - (x1 + size1);
    const relV = v1 - v2;

    // If touching/overlapping:
    if (gap <= EPS) {
      // collision only if moving into each other
      return relV > EPS ? 0 : Infinity;
    }

    // If not catching up:
    if (relV <= EPS) return Infinity;

    return gap / relV;
  };

  while (collisions < maxCollisions && t < maxTime) {
    const dtWall = timeToWall();
    const dtBlock = timeToBlock();
    const dt = Math.min(dtWall, dtBlock);

    if (!Number.isFinite(dt) || dt === Infinity) break;

    // advance
    x1 += v1 * dt;
    x2 += v2 * dt;
    t += dt;

    if (dt === dtWall) {
      // wall collision
      x1 = 0;       // snap exactly to wall
      v1 = -v1;
      collisions += 1;
    } else {
      // block collision: snap exactly
      x1 = x2 - size1;

      const u1 = v1, u2 = v2;
      v1 = ((m1 - m2) / (m1 + m2)) * u1 + ((2 * m2) / (m1 + m2)) * u2;
      v2 = ((2 * m1) / (m1 + m2)) * u1 + ((m2 - m1) / (m1 + m2)) * u2;

      collisions += 1;
    }

    // stopping condition (system separating forever)
    if (v1 >= 0 && v2 >= 0 && v2 >= v1) break;
  }

  return { collisions, t, x1, x2, v1, v2 };
}
