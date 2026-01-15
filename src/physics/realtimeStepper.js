export function stepRealtime(state, params, dt) {
  const { m1, m2, size1 } = params;
  const EPS = 1e-12;

  let { x1, x2, v1, v2, collisions } = state;

  let timeLeft = dt;
  let iter = 0;
  const MAX_EVENTS_PER_FRAME = 80;

  while (timeLeft > EPS && iter < MAX_EVENTS_PER_FRAME) {
    iter++;

    // time to wall
    const dtWall = v1 < -EPS ? (0 - x1) / v1 : Infinity;

    // time to block collision
    const gap = x2 - (x1 + size1);
    const relV = v1 - v2;

    let dtBlock = Infinity;
    if (gap <= EPS) dtBlock = relV > EPS ? 0 : Infinity;
    else dtBlock = relV > EPS ? gap / relV : Infinity;

    const next = Math.min(dtWall, dtBlock);

    if (!(next >= 0 && next <= timeLeft)) {
      x1 += v1 * timeLeft;
      x2 += v2 * timeLeft;
      timeLeft = 0;
      break;
    }

    // advance to collision
    x1 += v1 * next;
    x2 += v2 * next;
    timeLeft -= next;

    if (next === dtWall) {
      x1 = 0;
      v1 = -v1;
      collisions += 1;
    } else {
      // snap touching
      x1 = x2 - size1;

      const u1 = v1, u2 = v2;
      v1 = ((m1 - m2) / (m1 + m2)) * u1 + ((2 * m2) / (m1 + m2)) * u2;
      v2 = ((2 * m1) / (m1 + m2)) * u1 + ((m2 - m1) / (m1 + m2)) * u2;

      collisions += 1;
    }

    // numerical safety clamps
    if (x1 < 0) x1 = 0;
    if (x1 + size1 > x2) x1 = x2 - size1;
  }

  return { x1, x2, v1, v2, collisions };
}
