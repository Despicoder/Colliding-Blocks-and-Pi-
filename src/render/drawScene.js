import { theme } from "./theme";

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawGrid(ctx, x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;

  const step = 36;

  for (let xx = Math.floor(x / step) * step; xx <= x + w; xx += step) {
    ctx.beginPath();
    ctx.moveTo(xx + 0.5, y);
    ctx.lineTo(xx + 0.5, y + h);
    ctx.stroke();
  }

  for (let yy = Math.floor(y / step) * step; yy <= y + h; yy += step) {
    ctx.beginPath();
    ctx.moveTo(x, yy + 0.5);
    ctx.lineTo(x + w, yy + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawScene(ctx, sim, params) {
  // HiDPI-safe canvas size in CSS pixels
  const dpr = ctx.getTransform().a || 1;
  const W = ctx.canvas.width / dpr;
  const H = ctx.canvas.height / dpr;

  const { x1, x2 } = sim;
  const { size1, size2, m1, m2 } = params;

  // background
  ctx.clearRect(0, 0, W, H);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#05070c");
  bg.addColorStop(1, "#0b1020");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // subtle motion trail (makes animation look sharper/smoother)
  ctx.fillStyle = "rgba(5,7,12,0.22)";
  ctx.fillRect(0, 0, W, H);

  // Scene box geometry
  const pad = 18;
  const sceneX = pad;
  const sceneY = pad;
  const sceneW = W - pad * 2;
  const sceneH = H - pad * 2;
  const radius = 28;

  // Shadow + boundary
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 16;

  roundRectPath(ctx, sceneX, sceneY, sceneW, sceneH, radius);
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fill();
  ctx.restore();

  roundRectPath(ctx, sceneX, sceneY, sceneW, sceneH, radius);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Clip
  ctx.save();
  roundRectPath(ctx, sceneX, sceneY, sceneW, sceneH, radius);
  ctx.clip();

  // inner background
  const inner = ctx.createRadialGradient(
    sceneX + sceneW * 0.5,
    sceneY + sceneH * 0.25,
    sceneH * 0.1,
    sceneX + sceneW * 0.5,
    sceneY + sceneH * 0.5,
    sceneH * 0.95
  );
  inner.addColorStop(0, "rgba(255,255,255,0.08)");
  inner.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = inner;
  ctx.fillRect(sceneX, sceneY, sceneW, sceneH);

  // vignette
  const vig = ctx.createRadialGradient(
    sceneX + sceneW / 2,
    sceneY + sceneH / 2,
    sceneH * 0.2,
    sceneX + sceneW / 2,
    sceneY + sceneH / 2,
    sceneH * 0.9
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(sceneX, sceneY, sceneW, sceneH);

  drawGrid(ctx, sceneX, sceneY, sceneW, sceneH);

  // World layout
  const wallX = sceneX + 34;
  const floorY = sceneY + sceneH * 0.86; // lower floor for large block

  // floor
  ctx.strokeStyle = theme.floor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sceneX, floorY + 0.5);
  ctx.lineTo(sceneX + sceneW, floorY + 0.5);
  ctx.stroke();

  // ✅ wall must go up to upper boundary
  ctx.strokeStyle = theme.wall;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wallX + 0.5, sceneY);          // top near boundary
  ctx.lineTo(wallX + 0.5, floorY + 100);        // bottom beyond floor
  ctx.stroke();

  // wall hatching (full height)
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.3;
  for (let y = sceneY + 18; y <= floorY + 90; y += 22) {
    ctx.beginPath();
    ctx.moveTo(wallX - 18, y);
    ctx.lineTo(wallX - 2, y - 16);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Scaling
  const usableW = sceneX + sceneW - (wallX + 40);
  const WORLD_UNITS_VISIBLE = 20;
  const scale = usableW / WORLD_UNITS_VISIBLE;

  // blocks
  const b1x = Math.max(wallX, wallX + x1 * scale);
  const b2x = wallX + x2 * scale;

  const b1w = size1 * scale;
  const b2w = size2 * scale;

  // ✅ square blocks
  const b1h = b1w;
  const b2h = b2w;

  // gradients
  const g1 = ctx.createLinearGradient(0, floorY - b1h, 0, floorY);
  g1.addColorStop(0, theme.block1Top);
  g1.addColorStop(1, theme.block1Bottom);

  const g2 = ctx.createLinearGradient(0, floorY - b2h, 0, floorY);
  g2.addColorStop(0, theme.block2Top);
  g2.addColorStop(1, theme.block2Bottom);

  // shadow
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 10;

  // draw blocks
  ctx.fillStyle = g1;
  ctx.fillRect(b1x, floorY - b1h, b1w, b1h);

  ctx.fillStyle = g2;
  ctx.fillRect(b2x, floorY - b2h, b2w, b2h);

  // reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // edge highlight
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1;
  ctx.strokeRect(b1x + 0.5, floorY - b1h + 0.5, b1w - 1, b1h - 1);
  ctx.strokeRect(b2x + 0.5, floorY - b2h + 0.5, b2w - 1, b2h - 1);
  ctx.globalAlpha = 1;

  // masses above blocks
  ctx.fillStyle = theme.text;
  ctx.textAlign = "center";
  ctx.font = "500 18px ui-serif, Georgia, serif";

  // small block mass (always exact)
  ctx.fillText(
    `${Math.floor(m1)} kg`,
    b1x + b1w / 2,
    floorY - b1h - 12
  );

  // big block mass (draw exact, scientific if huge)
  let bigMassLabel;

  if (params.trueM2 && params.visualM2 && params.trueM2 > params.visualM2) {
    // scientific notation: a × 10^b
    const exp = Math.floor(Math.log10(params.trueM2));
    const mantissa = (params.trueM2 / Math.pow(10, exp)).toFixed(1);

    // superscript digits
    const superscripts = {
      "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
      "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻"
    };

    const expStr = String(exp)
      .split("")
      .map((d) => superscripts[d] || d)
      .join("");

    bigMassLabel = `${mantissa} × 10${expStr} kg`;
  } else {
    bigMassLabel = `${Math.floor(m2)} kg`;
  }

  ctx.fillText(
    bigMassLabel,
    b2x + b2w / 2,
    floorY - b2h - 12
  );

  // ===== Sparks (clean yellow flash) =====
  const sparks = params.sparks || [];
  for (const sp of sparks) {
    const age = (performance.now() - sp.t) / 220;
    if (age < 0 || age > 1) continue;

    const a = 1 - age;

    const sx = wallX + sp.x * scale;
    const sy = floorY - 25;

    const r = 10 + 10 * sp.strength;

    ctx.save();
    ctx.globalAlpha = 1.2 * a;

    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, "rgba(255, 240, 180, 0.55)");
    g.addColorStop(0.4, "rgba(255, 210, 90, 0.20)");
    g.addColorStop(1, "rgba(255, 190, 40, 0)");


    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

