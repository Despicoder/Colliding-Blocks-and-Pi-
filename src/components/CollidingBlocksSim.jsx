import React, { useEffect, useMemo, useRef, useState } from "react";
import { stepRealtime } from "../physics/realtimeStepper";
import { clamp } from "../physics/utils";
import { drawScene } from "../render/drawScene";

const CANVAS_H = 420;

const DEFAULT = {
  x1: 2,
  x2: 4,
  v1: 0,
  v2: -1,
  collisions: 0,
};

function createClackSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  const play = (strength = 1) => {
    // Safari/Chrome require resume after user gesture
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;

    // oscillator (metal click)
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(700 + 500 * strength, now);

    // gain envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15 * strength, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    // filter (less harsh)
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(3500, now);

    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  };

  return { play };
}

function setupHiDPICanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.floor(rect.width);
  const cssHeight = Math.floor(rect.height);
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function computeCollisionsHighMass(m2) {
  if (!Number.isFinite(m2) || m2 <= 1) return 3;
  
  const angle = Math.atan(Math.sqrt(1 / m2));
  if (angle === 0) return Infinity;

  return Math.floor(Math.PI / angle);
}

function formatMassLabel(m2) {
  if (m2 <= 1e12) {
    return m2.toExponential(0) + " kg";
  }
  return "10¹²… kg";
}

export default function CollidingBlocksSim() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const simRef = useRef({ ...DEFAULT });
  const audioRef = useRef(null);
  const lastCollisionRef = useRef(0);
  const collisionSinceResyncRef = useRef(0);
  const sparksRef = useRef([]);
  const [pulse, setPulse] = useState(false);
  const pulseTimeoutRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.8);
  const [infoOpen, setInfoOpen] = useState(false);
  const nextCollisionIsWallRef = useRef(false); // first collision = block
  const REAL_SIM_MAX_M2 = 1e12;
  const [showHighMassInfo, setShowHighMassInfo] = useState(false);

  const [m2Str, setM2Str] = useState("100");

  const [hud, setHud] = useState({
    collisions: 0,
    v1: 0,
    v2: -1,
  });

  const params = useMemo(() => {
    const m1 = 1;
    let m2 = Number(m2Str);
    if (!Number.isFinite(m2) || m2 < 1) m2 = 1;

    // true physical mass (used for collision math)
    const trueM2 = m2 > 1 ? m2 : 1;

    // visual mass is capped at 1e12
    const visualM2 = Math.min(trueM2, REAL_SIM_MAX_M2);

    const ratio = trueM2 / m1;
    const visualRatio = visualM2 / m1;

    const size1 = 1;
    const size2 = clamp(1 + 0.28 * Math.log10(visualRatio), 1, 4.6);

    return {
      m1,
      m2: trueM2,        // physics + collision formula
      visualM2,          // rendering only
      ratio,
      size1,
      size2,
    };

  }, [m2Str]);

  const highMassOnly = params.m2 > REAL_SIM_MAX_M2;

  const reset = () => {
    simRef.current = { ...DEFAULT };
    lastCollisionRef.current = 0;
    setHud({ collisions: 0, v1: 0, v2: -1 });
    setShowHighMassInfo(false);
    nextCollisionIsWallRef.current = false;
    collisionSinceResyncRef.current = 0;
  };

  useEffect(() => {
    reset();
    audioRef.current = createClackSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m2Str]);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx = setupHiDPICanvas(canvas);

    const onResize = () => { ctx = setupHiDPICanvas(canvas); };
    window.addEventListener("resize", onResize);

    let hudCounter = 0;
    const tick = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dtMs = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      const baseDt = Math.min(0.01, dtMs / 1000);
      const slowFactor = 1 + Math.log10(params.ratio) / 3;
      const safeSpeed = speed / slowFactor;
      const dt = baseDt * safeSpeed;
      const prev = simRef.current;
      if (playing && !highMassOnly) {
        simRef.current = stepRealtime(simRef.current, params, dt);
      }
      const c = simRef.current.collisions;
      if (c > lastCollisionRef.current) {
        const ep = 1e-4;
        const s = simRef.current;

        const strength = Math.min(1, Math.abs(s.v1 - s.v2) / 5);
        // sound clack
        audioRef.current?.play(strength);
        let isWallCollision = nextCollisionIsWallRef.current;

        // resync check every 2 collisions
        collisionSinceResyncRef.current += 1;

        if (collisionSinceResyncRef.current >= 2) {
          const velSuggestsWall = prev.v1 < 0;
          if (isWallCollision !== velSuggestsWall) {
            isWallCollision = velSuggestsWall;
            nextCollisionIsWallRef.current = isWallCollision; // resync expected sequence
          }
          collisionSinceResyncRef.current = 0;
        }

        // spark position
        const impactX = isWallCollision ? 0 : (prev.x1 + params.size1);

        sparksRef.current.push({
          x: impactX,
          isWall: isWallCollision,
          t: performance.now(),
          strength,
        });

        // toggle for next collision
        nextCollisionIsWallRef.current = !nextCollisionIsWallRef.current;

        // HUD pulse
        setPulse(true);
        if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = setTimeout(() => setPulse(false), 120);

        lastCollisionRef.current = c;
      }
      const nowMs = performance.now();
      sparksRef.current = sparksRef.current.filter((sp) => nowMs - sp.t < 160);

      drawScene(ctx, simRef.current, {
        ...params,
        collisions: simRef.current.collisions,
        sparks: sparksRef.current,
        trueM2: params.m2,
        visualM2: params.visualM2,
      });

      hudCounter++;
      if (hudCounter % 6 === 0) {
        const s = simRef.current;
        setHud({ collisions: s.collisions, v1: s.v1, v2: s.v2 });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, params]);

  const computedCollisions = useMemo(() => {
    if (!highMassOnly) return null;
    return computeCollisionsHighMass(params.m2);
  }, [highMassOnly, params.m2]);

  const expectedCollisions = useMemo(() => {
    return computeCollisionsHighMass(params.m2);
  }, [params.m2]);

  const handleMassChange = (e) => {
    const val = e.target.value;
    if (val === "" || /^[0-9eE.+-]+$/.test(val)) {
      setM2Str(val);
    }
  };


  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#05070c] text-white font-sans selection:bg-cyan-500/30">
      <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
        <div className="mx-auto w-full max-w-[1200px]">
          
          {/* ====== Header Row (Info left + Collisions right) ====== */}
          <div className="mb-4 flex items-end justify-between px-4">
            {/* ====== Info Drawer ====== */}
            <div className="w-[1400px] flex flex-col justify-start">
              <button
                onClick={() => setInfoOpen((v) => !v)}
                className="w-[300px] flex items-center justify-between neon-btn gold !py-3 !px-5 text-left"
              >
                <span className="font-serif text-2xl tracking-wide">Colliding Blocks and π</span>
                <span className="font-mono text-xl">{infoOpen ? "▴" : "▾"}</span>
              </button>
              
              {infoOpen && (
                <div
                  className="
                    isolate mt-3 rounded-3xl bg-[#05070c] p-8
                    shadow-[0_20px_60px_rgba(0,0,0,0.92)]
                    ring-1 ring-white/10
                    animate-[drawerIn_260ms_ease-out]
                  "
                >
                  <div className="space-y-4 text-[#f3f4f6] text-[17px] font-normal leading-relaxed">
                    <p>
                      This simulation is based on the famous{" "}
                      <b className="text-[#59f2d8]">Colliding Blocks</b> problem popularized by{" "}
                      <b className="text-[#ffd166]">3Blue1Brown</b>.
                      <br />
                      <a
                        href="https://www.youtube.com/watch?v=HEfHFsfGXjs&t=77s"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-2 font-mono text-sm text-[#59f2d8] underline underline-offset-4 hover:text-white transition-colors"
                      >
                        ▶ Watch the original video (3Blue1Brown)
                      </a>
                    </p>

                    <p>
                      Two blocks slide on a frictionless one-dimensional track and collide{" "}
                      <b className="text-[#59f2d8]">elastically</b>. The smaller block can also
                      bounce off a rigid wall. Every collision strictly conserves{" "}
                      <b className="text-[#59f2d8]">linear momentum</b> and{" "}
                      <b className="text-[#59f2d8]">kinetic energy</b>.
                    </p>

                    <p>
                      The surprising result is that when the mass ratio is chosen as{" "}
                      <b className="text-[#ffd166]">m₂ / m₁ = 100ⁿ</b>, the total number of
                      collisions that occur is{" "}
                      <b className="text-[#ffd166]">⌊π × 10ⁿ⌋</b>. In other words, the collision
                      count directly encodes the digits of{" "}
                      <b className="text-[#ffd166]">π</b> = 3.141592653589793238462643383279...
                    </p>

                    <div className="mt-4 rounded-2xl bg-black/40 p-4 ring-1 ring-white/10">
                      <div className="mb-2 font-semibold text-white">Controls</div>
                      <ul className="list-disc pl-6 space-y-2 text-[#e5e7eb]">
                        <li>
                          <b className="text-[#ffd166]">Mass Ratio (m₂)</b>: sets the mass of the
                          heavier block. The smaller block always has mass{" "}
                          <b className="text-[#ffd166]">m₁ = 1</b>. You may enter values using
                          normal numbers or scientific notation (for example{" "}
                          <b>100</b>, <b>10000</b>, <b>1e12</b>, <b>5e13</b>).
                        </li>

                        <li>
                          For visual clarity, the block’s displayed size increases with mass
                          only up to{" "}
                          <b className="text-[#ffd166]">10¹²</b>. Beyond this, the visual size is
                          capped, while the{" "}
                          <b className="text-[#59f2d8]">true physical mass</b> is still used for
                          collision calculations. The exact mass is shown above the block in
                          scientific notation.
                        </li>

                        <li>
                          <b className="text-[#ffd166]">Simulation Speed</b>: controls how fast
                          time advances visually. Increasing this makes collisions occur more
                          quickly on screen but does not change the underlying physics. Speeds
                          up to <b className="text-[#ffd166]">5×</b> are supported and have been
                          tested to remain stable.
                        </li>

                        <li>
                          <b className="text-[#ffd166]">Play / Pause</b>: starts or pauses the
                          simulation while preserving the current state.
                        </li>

                        <li>
                          <b className="text-[#ffd166]">Reset</b>: restores the system to its
                          initial configuration and clears the collision counter.
                        </li>
                      </ul>
                    </div>

                    <p className="text-white/60 text-sm">
                      For extremely large mass ratios, real-time animation becomes numerically
                      unstable. In such cases, the simulation automatically switches to an
                      analytic calculation mode, displaying the exact collision count without
                      animating every individual bounce.
                    </p>

                    <p className="text-white/60 text-sm">
                      When the displayed collision count reaches the theoretical value, a
                      <b className="text-[#59f2d8]"> Completed</b> indicator appears, signifying
                      that all physically possible collisions have occurred.
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>
          {/* ====== SEPARATOR TAG ====== */}
          <div className="mb-4 flex justify-center px-4">
            <div className="font-serif text-[18px] md:text-[22px] leading-none">
              <span
                className="
                  bg-gradient-to-r from-transparent via-[#59f2d8] to-transparent
                  bg-clip-text text-transparent
                  drop-shadow-[0_2px_10px_rgba(89,242,216,0.35)]
                  tracking-[0.35em]
                  select-none
                "
              >
                ──────────────────────────────────────
              </span>
            </div>
          </div>
          
          {/* ====== COLLISIONS TAG ====== */}
          <div className="mb-4 flex justify-center px-4">
            <div
              className={`font-serif text-[22px] md:text-[44px] tracking-wide leading-none
                transition-transform duration-150 ${
                  pulse ? "scale-[1.06]" : "scale-100"
                }`}
            >
              <span
                className="
                  bg-gradient-to-r from-[#59f2d8] via-[#e5faff] to-[#ffd166]
                  bg-clip-text text-transparent
                  drop-shadow-[0_2px_12px_rgba(89,242,216,0.35)]
                "
              >
                # Collisions:
              </span>{" "}
              <span
                className="
                  font-bold
                  text-[#ffd166]
                  drop-shadow-[0_2px_14px_rgba(255,209,102,0.45)]
                "
              >
                <span 
                  className="font-mono tabular-nums"
                >
                  {highMassOnly ? computedCollisions ?? "—" : hud.collisions}
                </span>
              </span>
            </div>
            <div className="mb-4 flex justify-end px-4">
              {!highMassOnly &&
                hud.collisions === expectedCollisions && (
                  <div className="mt-2 flex justify-center text-[#59f2d8] text-sm tracking-wide">
                    &nbsp;✓ Completed
                  </div>
              )}
            </div>
          </div>
          
          {highMassOnly && (
            <div className="mt-2 flex justify-center items-center gap-2 text-sm">
              <button
                onClick={() => setShowHighMassInfo((v) => !v)}
                className="
                  w-5 h-5 flex items-center justify-center
                  rounded-full border border-white/30
                  text-white font-bold
                  hover:bg-white/10 transition
                "
                title="High mass information"
              >
                i
              </button>

              {showHighMassInfo && (
                <span className="text-[#f3f4f6]">
                  <span className="text-[#ffd166] font-semibold">
                    &nbsp;&nbsp;High mass ratio detected.
                  </span>{" "}
                  Real-time animation is disabled for numerical stability.
                  <span className="text-[#59f2d8]">
                    {" "}Collision count is computed analytically.
                  </span>
                </span>
              )}
            </div>
          )}
                    
          {/* ====== 2. Visualization Stage ====== */}
          <div className="scene-shell mb-10 w-full shadow-2xl shadow-black/50" style={{ height: CANVAS_H }}>
            <canvas ref={canvasRef} className="block h-full w-full" />
          </div>
          <br />
          {/* ====== 3. Control Panel ====== */}
          <div className="flex w-full max-w-[400px] items-center justify-between gap-8 mb-6">
            {/* ROW A: Playback Controls (aligned with rows below) */}
            <div className="flex w-full max-w-[700px] items-center justify-between">
              {/* left column = exactly same column as Mass Ratio / Simulation Speed tags */}
              <div className="w-[240px] flex justify-start">
                <button
                  className="neon-btn gold min-w-[140px] tracking-wider"
                  onClick={() => setPlaying(!playing)}
                >
                  {playing ? "PAUSE" : "PLAY"}
                </button>
              </div>

              {/* right column = exactly same column as input/slider */}
              <div className="w-[380px] flex justify-start">
                <button
                  className="neon-btn gold min-w-[140px] tracking-wider"
                  onClick={reset}
                >
                  RESET
                </button>
              </div>
            </div>


            {/* ROW B: Mass Input (aligned columns) */}
            <div className="flex w-full max-w-[700px] items-center justify-between">
              {/* left tag column */}
              <div className="w-[240px] flex justify-start">
                <div className="neon-btn green pointer-events-none select-none !px-3 !py-1 text-base">
                  Mass Ratio
                </div>
              </div>

              {/* right control column */}
              <div className="w-[350px] flex justify-start">
                <div className="relative group w-[140px]">
                  <input
                    type="text"
                    value={m2Str}
                    onChange={handleMassChange}
                    className="w-full bg-[#0b1020] border-2 border-white/20 rounded-lg px-3 py-2 text-center text-xl font-mono text-[#59f2d8] focus:border-[#59f2d8] focus:outline-none focus:shadow-[0_0_15px_rgba(89,242,216,0.3)] transition-all"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">
                  </span>
                </div>
              </div>
            </div>



            {/* ROW C: Slider (aligned columns) */}
            <div className="flex w-full max-w-[700px] items-center justify-between">
              {/* left tag column */}
              <div className="w-[240px] flex justify-start">
                <div className="neon-btn blue pointer-events-none select-none !px-4 !py-2 text-lg whitespace-nowrap">
                  Simulation Speed
                </div>
              </div>

              {/* right control column */}
              <div className="w-[200px] flex items-center gap-4">
                <input
                  type="range"
                  min={0.2}
                  max={5}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="speed-slider flex-grow cursor-pointer"
                />
                <span className="font-mono text-[#59f2d8] w-12 text-right">
                  {speed.toFixed(1)}x
                </span>
              </div>
            </div>


          </div>

        </div>
      </div>
      
    </div>
  );
}