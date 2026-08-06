/* ============================================================================
   SMART TAXI ROOF SIGN — INTERACTIVE VIRTUAL PROTOTYPE
   ============================================================================
   Module map (kept in one file for the sandbox; split along these lines when
   you move it into a real Vite project):

     /model        → buildEnclosure, buildSolarPanel, buildMagneticFeet, buildCarRoof
     /electronics  → makeDisplayTexture, drawDisplay, buildStatusLeds, buildEdgeStrip
     /bluetooth    → MockTransport (implements the Transport interface)
     /power        → usePowerSystem (solar in, battery, auto-brightness)
     /ui           → PhoneController, TelemetryPanel, SceneHints
     /animation    → the rAF loop in Viewport + easing helpers

   The Transport interface is shaped after the real Web Bluetooth API so that
   MockTransport can be swapped for WebBluetoothTransport with no UI changes.
   ========================================================================== */

import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

/* ── design tokens ───────────────────────────────────────────────────────── */
const T = {
  amber: "#FFB020",
  amberDim: "#8A5E12",
  cyan: "#3ED6D0",
  ble: "#2E9BFF",
  red: "#FF4438",
  green: "#3ADB7C",
  ink: "#0B0E11",
  panel: "#12171C",
  line: "#212B33",
  text: "#C9D4DC",
  mute: "#6C7B87",
};

/* ── geometry constants (1 unit ≈ 100 mm) ────────────────────────────────── */
const DEV = { W: 6.0, H: 1.8, D: 1.2, R: 0.28, BEV: 0.05 };
const FRONT_Z = DEV.D / 2 + DEV.BEV;
const TOP_Y = DEV.H / 2 + DEV.BEV;

/* ============================================================================
   /bluetooth — transport interface + mock implementation
   ========================================================================== */

const BLE_STATE = {
  IDLE: "idle",
  SCANNING: "scanning",
  FOUND: "found",
  PAIRING: "pairing",
  PIN_REQUIRED: "pin_required",
  CONNECTED: "connected",
  LOCKED: "locked",
};

function useMockBluetooth() {
  const [state, setState] = useState(BLE_STATE.IDLE);
  const [pin, setPin] = useState(null);        // null = never provisioned
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [rssi, setRssi] = useState(-70);
  const [log, setLog] = useState([]);
  const [pendingPin, setPendingPin] = useState(false); // first pair → set a PIN
  const timers = useRef([]);

  const say = useCallback((msg, kind = "info") => {
    setLog((l) => [{ t: Date.now(), msg, kind }, ...l].slice(0, 40));
  }, []);

  const after = (ms, fn) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const scan = useCallback(() => {
    if (state !== BLE_STATE.IDLE) return;
    setState(BLE_STATE.SCANNING);
    say("Scanning for nearby devices…");
    after(1400, () => {
      setState(BLE_STATE.FOUND);
      setRssi(-52 - Math.floor(Math.random() * 12));
      say("Found ROOFSIGN-A31F");
    });
  }, [state, say]);

  const connect = useCallback(() => {
    if (state !== BLE_STATE.FOUND) return;
    if (Date.now() < lockUntil) {
      say("Device is locked out. Wait for the timer.", "err");
      return;
    }
    setState(BLE_STATE.PAIRING);
    say("Negotiating GATT connection…");
    after(1100, () => {
      if (pin === null) {
        setState(BLE_STATE.CONNECTED);
        setPendingPin(true);
        say("First pairing — link open, no PIN on record", "ok");
      } else {
        setState(BLE_STATE.PIN_REQUIRED);
        say("Known device — PIN required to unlock");
      }
    });
  }, [state, pin, lockUntil, say]);

  const submitPin = useCallback(
    (entry) => {
      if (state !== BLE_STATE.PIN_REQUIRED) return false;
      if (entry === pin) {
        setAttempts(0);
        setState(BLE_STATE.CONNECTED);
        say("PIN accepted — sign unlocked", "ok");
        return true;
      }
      const n = attempts + 1;
      setAttempts(n);
      if (n >= 3) {
        const until = Date.now() + 20000;
        setLockUntil(until);
        setState(BLE_STATE.LOCKED);
        say("3 failed attempts — sign locked for 20 s", "err");
        after(20000, () => {
          setAttempts(0);
          setState(BLE_STATE.IDLE);
          say("Lockout expired");
        });
      } else {
        say(`Wrong PIN — ${3 - n} attempt${3 - n === 1 ? "" : "s"} left`, "err");
      }
      return false;
    },
    [state, pin, attempts, say]
  );

  const provisionPin = useCallback(
    (p) => {
      setPin(p);
      setPendingPin(false);
      say(`PIN set. Every future pairing will require it.`, "ok");
    },
    [say]
  );

  const disconnect = useCallback(() => {
    setState(BLE_STATE.IDLE);
    setPendingPin(false);
    say("Disconnected");
  }, [say]);

  const forgetDevice = useCallback(() => {
    if (state !== BLE_STATE.CONNECTED) {
      say("Reset refused — only an authenticated phone can clear the PIN", "err");
      return;
    }
    setPin(null);
    setState(BLE_STATE.IDLE);
    say("PIN cleared. Sign is back to factory state.");
  }, [state, say]);

  return {
    state, pin, attempts, rssi, log, pendingPin, lockUntil,
    scan, connect, submitPin, provisionPin, disconnect, forgetDevice,
    connected: state === BLE_STATE.CONNECTED,
    locked: state === BLE_STATE.LOCKED,
  };
}

/* ============================================================================
   /power — solar in, battery, auto-brightness
   ========================================================================== */

function usePowerSystem(isDay, screenOn) {
  const [battery, setBattery] = useState(78);
  const brightness = isDay ? 100 : 34;      // night needs far less output
  const solarW = isDay ? 4.6 : 0;
  const drawW = screenOn ? (isDay ? 6.4 : 2.1) : 0.15;

  useEffect(() => {
    const id = setInterval(() => {
      setBattery((b) => {
        const net = (solarW - drawW) * 0.09;  // demo-accelerated
        return Math.max(0, Math.min(100, b + net));
      });
    }, 400);
    return () => clearInterval(id);
  }, [solarW, drawW]);

  return { battery, brightness, solarW, drawW, powered: battery > 1 };
}

/* ============================================================================
   /electronics — LED-matrix display rendered to a CanvasTexture
   ========================================================================== */

const DISP_W = 1024;
const DISP_H = 240;

function makePixelGrid() {
  const c = document.createElement("canvas");
  c.width = DISP_W;
  c.height = DISP_H;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.42)";
  for (let x = 0; x < DISP_W; x += 4) g.fillRect(x, 0, 1.4, DISP_H);
  for (let y = 0; y < DISP_H; y += 4) g.fillRect(0, y, DISP_W, 1.4);
  return c;
}

const isRTL = (s) => /[\u0600-\u06FF]/.test(s);

function drawDisplay(ctx, grid, s, time) {
  ctx.clearRect(0, 0, DISP_W, DISP_H);
  ctx.fillStyle = "#04070A";
  ctx.fillRect(0, 0, DISP_W, DISP_H);

  if (!s.powered) {
    ctx.drawImage(grid, 0, 0);
    return;
  }

  const a = s.brightness / 100;
  const lit = s.locked ? T.red : T.amber;
  ctx.globalAlpha = a;

  if (s.locked) {
    const blink = Math.sin(time * 7) > -0.2 ? 1 : 0.25;
    ctx.globalAlpha = a * blink;
    ctx.fillStyle = T.red;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 92px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("· LOCKED ·", DISP_W / 2, DISP_H / 2 - 8);
    ctx.font = "bold 30px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("UNAUTHORISED CONTROLLER", DISP_W / 2, DISP_H / 2 + 62);
    ctx.globalAlpha = 1;
    ctx.drawImage(grid, 0, 0);
    return;
  }

  const dividers = [568, 792];
  ctx.fillStyle = lit;
  ctx.globalAlpha = a * 0.28;
  dividers.forEach((x) => ctx.fillRect(x, 26, 3, DISP_H - 52));
  ctx.globalAlpha = a;

  const label = (txt, x) => {
    ctx.fillStyle = lit;
    ctx.globalAlpha = a * 0.55;
    ctx.font = "600 24px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.letterSpacing = "3px";
    ctx.fillText(txt, x, 30);
    ctx.letterSpacing = "0px";
    ctx.globalAlpha = a;
  };

  /* ── zone A · destination (scrolls when it overflows) ── */
  label("DESTINATION", 26);
  const zx = 26, zw = 520;
  ctx.save();
  ctx.beginPath();
  ctx.rect(zx, 74, zw, 132);
  ctx.clip();
  ctx.fillStyle = lit;
  ctx.textBaseline = "middle";
  const rtl = isRTL(s.destination);
  ctx.font = rtl
    ? '700 78px "Segoe UI", Tahoma, Arial, sans-serif'
    : "700 82px ui-monospace, Menlo, Consolas, monospace";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = "left";
  const tw = ctx.measureText(s.destination).width;
  if (tw > zw) {
    const gap = 90;
    const period = tw + gap;
    const off = (time * 62) % period;
    ctx.fillText(s.destination, zx - off, 142);
    ctx.fillText(s.destination, zx - off + period, 142);
  } else {
    ctx.fillText(s.destination, zx, 142);
  }
  ctx.restore();
  ctx.direction = "ltr";

  /* ── zone B · seats ── */
  label("SEATS", 592);
  ctx.fillStyle = lit;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "700 88px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText(String(s.seats), 592, 142);
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = i < s.seats ? a : a * 0.16;
    ctx.fillRect(700 + i * 22, 118, 14, 46);
  }
  ctx.globalAlpha = a;

  /* ── zone C · price ── */
  label("FARE", 816);
  ctx.fillStyle = lit;
  ctx.font = "700 74px ui-monospace, Menlo, Consolas, monospace";
  ctx.fillText(String(s.price), 816, 136);
  ctx.font = "600 26px ui-monospace, Menlo, Consolas, monospace";
  ctx.globalAlpha = a * 0.6;
  ctx.fillText("AFN", 816, 192);

  ctx.globalAlpha = 1;
  ctx.drawImage(grid, 0, 0);
}

/* ============================================================================
   /model — parametric enclosure
   ========================================================================== */

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

function makeSolarTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 200;
  const g = c.getContext("2d");
  g.fillStyle = "#0A1330";
  g.fillRect(0, 0, 1024, 200);
  for (let i = 0; i < 8; i++) {
    const x = 8 + i * 127;
    const grd = g.createLinearGradient(x, 0, x + 118, 184);
    grd.addColorStop(0, "#16255C");
    grd.addColorStop(0.5, "#101B45");
    grd.addColorStop(1, "#1B2E6E");
    g.fillStyle = grd;
    g.fillRect(x, 8, 118, 184);
    g.strokeStyle = "rgba(180,200,255,0.30)";
    g.lineWidth = 2;
    for (let b = 1; b < 4; b++) { // busbars
      g.beginPath(); g.moveTo(x + b * 29, 8); g.lineTo(x + b * 29, 192); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function makeGlowSprite(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, color);
  grd.addColorStop(0.25, color + "aa");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, toneMapped: false,
  });
  return new THREE.Sprite(mat);
}

/* ============================================================================
   Viewport — three.js scene + hand-rolled orbit controls
   ========================================================================== */

function Viewport({ stateRef }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0A0D10");
    scene.fog = new THREE.Fog("#0A0D10", 18, 42);

    const camera = new THREE.PerspectiveCamera(38, mount.clientWidth / mount.clientHeight, 0.1, 120);

    /* ── procedural studio environment for reflections ── */
    const envCanvas = document.createElement("canvas");
    envCanvas.width = 512; envCanvas.height = 256;
    {
      const g = envCanvas.getContext("2d");
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, "#2A3946");
      grd.addColorStop(0.5, "#0E1318");
      grd.addColorStop(1, "#05070A");
      g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
      const box = (x, y, w, h, c) => {
        const r = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
        r.addColorStop(0, c); r.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = r; g.fillRect(x, y, w, h);
      };
      box(60, 20, 170, 110, "#FFFFFF");
      box(300, 30, 150, 90, "#BFD8FF");
      box(190, 150, 200, 90, "#3A4A58");
    }
    const envTex = new THREE.CanvasTexture(envCanvas);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(envTex).texture;

    /* ── lights ── */
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(6, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -10; key.shadow.camera.right = 10;
    key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd4ff, 1.1);
    rim.position.set(-7, 4, -6);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x5b7183, 0x090b0e, 0.55));

    /* ── /model · car roof ── */
    const roofMat = new THREE.MeshPhysicalMaterial({
      color: 0x1A2026, metalness: 0.55, roughness: 0.35,
      clearcoat: 1, clearcoatRoughness: 0.08,
    });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.35, 9.5), roofMat);
    roof.position.y = -1.36;
    roof.receiveShadow = true;
    scene.add(roof);

    /* ── /model · enclosure shell ── */
    const shellGeo = new THREE.ExtrudeGeometry(roundedRect(DEV.W, DEV.H, DEV.R), {
      depth: DEV.D, bevelEnabled: true, bevelThickness: DEV.BEV,
      bevelSize: DEV.BEV, bevelSegments: 4, curveSegments: 16,
    });
    shellGeo.center();
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x23292F, metalness: 0.35, roughness: 0.42,
      clearcoat: 0.85, clearcoatRoughness: 0.25,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.castShadow = true;
    scene.add(shell);

    /* ── /model · IP67 seam gasket (top shell / bottom shell parting line) ── */
    const seam = new THREE.Mesh(
      new THREE.BoxGeometry(DEV.W - 0.1, 0.05, DEV.D + 0.115),
      new THREE.MeshStandardMaterial({ color: 0x0D1013, roughness: 0.95 })
    );
    seam.position.y = -0.16;
    scene.add(seam);

    /* ── /electronics · display (double sided) ── */
    const dispCanvas = document.createElement("canvas");
    dispCanvas.width = DISP_W; dispCanvas.height = DISP_H;
    const dispCtx = dispCanvas.getContext("2d");
    const grid = makePixelGrid();
    const dispTex = new THREE.CanvasTexture(dispCanvas);
    dispTex.encoding = THREE.sRGBEncoding;
    const dispMat = new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false });

    const dw = 5.32, dh = (dw * DISP_H) / DISP_W;
    const bezelMat = new THREE.MeshPhysicalMaterial({
      color: 0x05070A, metalness: 0.2, roughness: 0.12, clearcoat: 1,
    });
    [1, -1].forEach((dir) => {
      const bez = new THREE.Mesh(new THREE.PlaneGeometry(dw + 0.16, dh + 0.16), bezelMat);
      bez.position.set(0, 0.02, dir * (FRONT_Z + 0.004));
      if (dir < 0) bez.rotation.y = Math.PI;
      scene.add(bez);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), dispMat);
      scr.position.set(0, 0.02, dir * (FRONT_Z + 0.012));
      if (dir < 0) scr.rotation.y = Math.PI;
      scene.add(scr);
    });

    /* ── /electronics · RGB status strip below the screen, both faces ── */
    const stripMat = new THREE.MeshBasicMaterial({ color: 0x2E9BFF, toneMapped: false });
    const strips = [1, -1].map((dir) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(dw, 0.085), stripMat);
      m.position.set(0, -0.74, dir * (FRONT_Z + 0.012));
      if (dir < 0) m.rotation.y = Math.PI;
      scene.add(m);
      const gl = makeGlowSprite("#2E9BFF");
      gl.scale.set(6.4, 1.5, 1);
      gl.position.set(0, -0.74, dir * (FRONT_Z + 0.06));
      scene.add(gl);
      return gl;
    });

    /* ── /model · solar panel on the top shell ── */
    const solar = new THREE.Mesh(
      new THREE.PlaneGeometry(5.3, 0.82),
      new THREE.MeshPhysicalMaterial({
        map: makeSolarTexture(), metalness: 0.35, roughness: 0.14,
        clearcoat: 1, clearcoatRoughness: 0.05,
      })
    );
    solar.rotation.x = -Math.PI / 2;
    solar.position.set(0, TOP_Y + 0.003, -0.09);
    scene.add(solar);

    /* ── /electronics · three indicator LEDs on the top front lip ── */
    const ledDefs = [
      { key: "power", color: 0x3ADB7C, x: -2.44 },
      { key: "ble",   color: 0x2E9BFF, x: -2.20 },
      { key: "lock",  color: 0xFF4438, x: -1.96 },
    ];
    const leds = ledDefs.map((d) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.052, 16, 12),
        new THREE.MeshBasicMaterial({ color: d.color, toneMapped: false })
      );
      mesh.position.set(d.x, TOP_Y + 0.012, 0.44);
      scene.add(mesh);
      const glow = makeGlowSprite("#" + d.color.toString(16).padStart(6, "0"));
      glow.scale.set(0.62, 0.62, 1);
      glow.position.copy(mesh.position);
      scene.add(glow);
      return { ...d, mesh, glow };
    });

    /* ── /model · magnetic feet + rubber isolation pads ── */
    const magMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.88 });
    const steelMat = new THREE.MeshPhysicalMaterial({
      color: 0x8A949C, metalness: 1, roughness: 0.28,
    });
    [[-2.3, 0.34], [2.3, 0.34], [-2.3, -0.34], [2.3, -0.34]].forEach(([x, z]) => {
      const steel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 24), steelMat);
      steel.position.set(x, -TOP_Y - 0.06, z);
      steel.castShadow = true;
      scene.add(steel);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 24), magMat);
      pad.position.set(x, -TOP_Y - 0.17, z);
      pad.castShadow = true;
      scene.add(pad);
    });
    /* cable strain relief + tether eyelet (anti-theft) */
    const tether = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.035, 10, 24), steelMat
    );
    tether.position.set(2.72, -TOP_Y - 0.05, 0);
    tether.rotation.y = Math.PI / 2;
    scene.add(tether);

    /* ── camera + hand-rolled orbit controls ── */
    const sph = { theta: 0.62, phi: 1.16, radius: 13.4 };
    const target = new THREE.Vector3(0, 0.1, 0);
    let dragging = false, lx = 0, ly = 0;
    const vel = { t: 0, p: 0 };

    const applyCam = () => {
      sph.phi = Math.max(0.22, Math.min(1.52, sph.phi));
      sph.radius = Math.max(7, Math.min(26, sph.radius));
      camera.position.set(
        target.x + sph.radius * Math.sin(sph.phi) * Math.sin(sph.theta),
        target.y + sph.radius * Math.cos(sph.phi),
        target.z + sph.radius * Math.sin(sph.phi) * Math.cos(sph.theta)
      );
      camera.lookAt(target);
    };
    applyCam();

    const el = renderer.domElement;
    el.style.touchAction = "none";
    const down = (e) => { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); };
    const move = (e) => {
      if (!dragging) return;
      vel.t = -(e.clientX - lx) * 0.006;
      vel.p = -(e.clientY - ly) * 0.006;
      sph.theta += vel.t; sph.phi += vel.p;
      lx = e.clientX; ly = e.clientY;
      applyCam();
    };
    const up = (e) => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch (_) {} };
    const wheel = (e) => { e.preventDefault(); sph.radius *= 1 + e.deltaY * 0.0011; applyCam(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });

    /* ── /animation · render loop ── */
    const clock = new THREE.Clock();
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      const s = stateRef.current;

      if (!dragging) {
        vel.t *= 0.94; vel.p *= 0.94;
        if (Math.abs(vel.t) > 1e-4 || Math.abs(vel.p) > 1e-4) {
          sph.theta += vel.t; sph.phi += vel.p; applyCam();
        }
      }

      drawDisplay(dispCtx, grid, s, t);
      dispTex.needsUpdate = true;

      /* status strip colour follows the link state */
      let stripCol = 0x101820, stripAmt = 0.12;
      if (s.bleState === BLE_STATE.SCANNING || s.bleState === BLE_STATE.PAIRING) {
        stripCol = 0x2E9BFF; stripAmt = 0.4 + 0.6 * Math.abs(Math.sin(t * 5));
      } else if (s.bleState === BLE_STATE.PIN_REQUIRED) {
        stripCol = 0xFFB020; stripAmt = 0.5 + 0.5 * Math.abs(Math.sin(t * 3));
      } else if (s.bleState === BLE_STATE.LOCKED) {
        stripCol = 0xFF4438; stripAmt = Math.sin(t * 7) > 0 ? 1 : 0.15;
      } else if (s.connected) {
        stripCol = 0x3ED6D0; stripAmt = 0.85;
      }
      stripMat.color.setHex(stripCol);
      strips.forEach((g) => {
        g.material.color.setHex(stripCol);
        g.material.opacity = stripAmt * 0.55 * (s.powered ? 1 : 0);
        g.scale.set(6.4, 1.4 + stripAmt * 0.5, 1);
      });
      stripMat.opacity = stripAmt;

      /* indicator LEDs */
      const lvl = {
        power: s.powered ? (s.isDay ? 1 : 0.55) : 0,
        ble: s.connected ? 1 : (s.bleState === BLE_STATE.IDLE ? 0.06 : Math.abs(Math.sin(t * 5))),
        lock: s.locked ? (Math.sin(t * 7) > 0 ? 1 : 0.05) : (s.hasPin ? 0.35 : 0.05),
      };
      leds.forEach((l) => {
        const v = lvl[l.key] ?? 0;
        l.mesh.material.color.setHex(l.color).multiplyScalar(0.15 + v * 0.85);
        l.glow.material.opacity = v * 0.9;
        l.glow.scale.setScalar(0.4 + v * 0.4);
      });

      /* daylight */
      key.intensity = s.isDay ? 2.1 : 0.35;
      rim.intensity = s.isDay ? 1.1 : 0.55;
      scene.background.setHex(s.isDay ? 0x0F141A : 0x05070A);
      renderer.toneMappingExposure = s.isDay ? 1.05 : 0.72;

      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      pmrem.dispose();
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, [stateRef]);

  return <div ref={mountRef} className="absolute inset-0" />;
}

/* ============================================================================
   /ui — phone controller
   ========================================================================== */

const PRESETS = [
  { d: "KARTE NAW", p: 30 },
  { d: "DEH BURI", p: 25 },
  { d: "SHAHR-E-NAW → KHAIR KHANA", p: 60 },
  { d: "کارته نو", p: 30 },
  { d: "دهبوری → پل سرخ", p: 45 },
];

function Keypad({ value, onChange, onSubmit, label, cta, danger }) {
  const press = (k) => {
    if (k === "del") return onChange(value.slice(0, -1));
    if (value.length < 4) onChange(value + k);
  };
  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] mb-2" style={{ color: T.mute }}>{label}</div>
      <div className="flex gap-2 mb-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1 h-11 rounded-lg flex items-center justify-center text-lg font-mono"
            style={{
              background: "#0A0E12",
              border: `1px solid ${value.length === i ? (danger ? T.red : T.cyan) : T.line}`,
              color: T.text,
            }}>
            {value[i] ? "•" : ""}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {["1","2","3","4","5","6","7","8","9","del","0",""].map((k, i) =>
          k === "" ? <div key={i} /> : (
            <button key={i} onClick={() => press(k)}
              className="h-10 rounded-lg text-sm font-mono active:opacity-60"
              style={{ background: "#141A20", border: `1px solid ${T.line}`, color: T.text }}>
              {k === "del" ? "⌫" : k}
            </button>
          )
        )}
      </div>
      <button onClick={onSubmit} disabled={value.length !== 4}
        className="w-full mt-3 h-10 rounded-lg text-xs font-semibold tracking-wider disabled:opacity-30"
        style={{ background: danger ? T.red : T.cyan, color: "#04070A" }}>
        {cta}
      </button>
    </div>
  );
}

function PhoneController({ ble, sign, setSign, isDay }) {
  const [entry, setEntry] = useState("");
  const [newPin, setNewPin] = useState("");
  const [draft, setDraft] = useState(sign);

  useEffect(() => { setDraft(sign); }, [sign]);
  useEffect(() => { if (ble.state !== BLE_STATE.PIN_REQUIRED) setEntry(""); }, [ble.state]);

  const push = () => setSign(draft);
  const dirty = draft.destination !== sign.destination || draft.seats !== sign.seats || draft.price !== sign.price;

  const statusText = {
    [BLE_STATE.IDLE]: "Not connected",
    [BLE_STATE.SCANNING]: "Scanning…",
    [BLE_STATE.FOUND]: "ROOFSIGN-A31F found",
    [BLE_STATE.PAIRING]: "Pairing…",
    [BLE_STATE.PIN_REQUIRED]: "PIN required",
    [BLE_STATE.CONNECTED]: "Connected",
    [BLE_STATE.LOCKED]: "Locked out",
  }[ble.state];

  const statusColor = {
    [BLE_STATE.CONNECTED]: T.cyan,
    [BLE_STATE.LOCKED]: T.red,
    [BLE_STATE.PIN_REQUIRED]: T.amber,
  }[ble.state] || T.mute;

  return (
    <div className="rounded-[26px] overflow-hidden flex flex-col"
      style={{ background: "#0E1216", border: `1px solid ${T.line}`, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
      {/* phone status bar */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between text-[10px] font-mono" style={{ color: T.mute }}>
        <span>DRIVER APP</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
          {statusText}
        </span>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* ── link control ── */}
        {ble.state === BLE_STATE.IDLE && (
          <button onClick={ble.scan}
            className="w-full h-11 rounded-xl text-xs font-semibold tracking-widest"
            style={{ background: T.ble, color: "#04070A" }}>
            SCAN FOR SIGN
          </button>
        )}

        {ble.state === BLE_STATE.SCANNING && (
          <div className="h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-mono"
            style={{ background: "#0A0E12", border: `1px solid ${T.line}`, color: T.mute }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: T.ble, animationDelay: `${i * 0.18}s` }} />
            ))}
            searching
          </div>
        )}

        {(ble.state === BLE_STATE.FOUND || ble.state === BLE_STATE.PAIRING) && (
          <div className="rounded-xl p-3" style={{ background: "#0A0E12", border: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <div className="text-xs font-semibold" style={{ color: T.text }}>ROOFSIGN-A31F</div>
                <div className="text-[10px] font-mono" style={{ color: T.mute }}>{ble.rssi} dBm · {ble.pin ? "known" : "new device"}</div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded"
                style={{ background: "#141A20", color: T.ble }}>BLE</span>
            </div>
            <button onClick={ble.connect} disabled={ble.state === BLE_STATE.PAIRING}
              className="w-full h-9 rounded-lg text-xs font-semibold tracking-widest disabled:opacity-50"
              style={{ background: T.ble, color: "#04070A" }}>
              {ble.state === BLE_STATE.PAIRING ? "PAIRING…" : "CONNECT"}
            </button>
          </div>
        )}

        {ble.state === BLE_STATE.PIN_REQUIRED && (
          <div className="rounded-xl p-3" style={{ background: "#0A0E12", border: `1px solid ${T.amber}44` }}>
            <Keypad value={entry} onChange={setEntry}
              onSubmit={() => { if (!ble.submitPin(entry)) setEntry(""); }}
              label={`ENTER SIGN PIN${ble.attempts ? ` · ${3 - ble.attempts} LEFT` : ""}`}
              cta="UNLOCK" danger={ble.attempts > 0} />
          </div>
        )}

        {ble.state === BLE_STATE.LOCKED && (
          <div className="rounded-xl p-4 text-center" style={{ background: "#1A0B0B", border: `1px solid ${T.red}55` }}>
            <div className="text-xs font-semibold mb-1" style={{ color: T.red }}>Sign locked</div>
            <div className="text-[11px] leading-relaxed" style={{ color: T.mute }}>
              Too many wrong PINs. The sign stops accepting pairings and shows LOCKED until the timer clears.
            </div>
          </div>
        )}

        {ble.connected && ble.pendingPin && (
          <div className="rounded-xl p-3" style={{ background: "#0A0E12", border: `1px solid ${T.cyan}44` }}>
            <Keypad value={newPin} onChange={setNewPin}
              onSubmit={() => { ble.provisionPin(newPin); setNewPin(""); }}
              label="SET A PIN FOR THIS SIGN" cta="SAVE PIN" />
            <p className="text-[10px] mt-2 leading-relaxed" style={{ color: T.mute }}>
              First pairing is open. After this, any phone — including a thief's — must enter the PIN.
            </p>
          </div>
        )}

        {/* ── sign controls ── */}
        {ble.connected && !ble.pendingPin && (
          <>
            <div className="space-y-2.5">
              <div>
                <div className="text-[10px] tracking-[0.2em] mb-1.5" style={{ color: T.mute }}>DESTINATION</div>
                <input value={draft.destination} maxLength={40}
                  onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none"
                  style={{ background: "#0A0E12", border: `1px solid ${T.line}`, color: T.text }} />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PRESETS.map((p) => (
                    <button key={p.d} onClick={() => setDraft({ ...draft, destination: p.d, price: p.p })}
                      className="px-2 py-1 rounded text-[10px]"
                      style={{ background: "#141A20", border: `1px solid ${T.line}`, color: T.mute }}>
                      {p.d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="text-[10px] tracking-[0.2em] mb-1.5" style={{ color: T.mute }}>SEATS</div>
                  <div className="flex items-center rounded-lg overflow-hidden" style={{ background: "#0A0E12", border: `1px solid ${T.line}` }}>
                    <button onClick={() => setDraft({ ...draft, seats: Math.max(0, draft.seats - 1) })}
                      className="w-9 h-10 text-lg" style={{ color: T.mute }}>−</button>
                    <div className="flex-1 text-center font-mono text-sm" style={{ color: T.text }}>{draft.seats}</div>
                    <button onClick={() => setDraft({ ...draft, seats: Math.min(4, draft.seats + 1) })}
                      className="w-9 h-10 text-lg" style={{ color: T.mute }}>+</button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.2em] mb-1.5" style={{ color: T.mute }}>FARE · AFN</div>
                  <div className="flex items-center rounded-lg overflow-hidden" style={{ background: "#0A0E12", border: `1px solid ${T.line}` }}>
                    <button onClick={() => setDraft({ ...draft, price: Math.max(0, draft.price - 5) })}
                      className="w-9 h-10 text-lg" style={{ color: T.mute }}>−</button>
                    <div className="flex-1 text-center font-mono text-sm" style={{ color: T.text }}>{draft.price}</div>
                    <button onClick={() => setDraft({ ...draft, price: draft.price + 5 })}
                      className="w-9 h-10 text-lg" style={{ color: T.mute }}>+</button>
                  </div>
                </div>
              </div>
            </div>

            <button onClick={push} disabled={!dirty}
              className="w-full h-11 rounded-xl text-xs font-semibold tracking-widest disabled:opacity-30"
              style={{ background: T.cyan, color: "#04070A" }}>
              {dirty ? "SEND TO SIGN" : "SIGN IS UP TO DATE"}
            </button>

            <div className="flex gap-2">
              <button onClick={ble.disconnect}
                className="flex-1 h-9 rounded-lg text-[11px]"
                style={{ background: "#141A20", border: `1px solid ${T.line}`, color: T.mute }}>
                Disconnect
              </button>
              <button onClick={ble.forgetDevice}
                className="flex-1 h-9 rounded-lg text-[11px]"
                style={{ background: "#141A20", border: `1px solid ${T.line}`, color: T.mute }}>
                Clear PIN
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── telemetry ───────────────────────────────────────────────────────────── */
function Bar({ label, value, unit, pct, color }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono mb-1">
        <span style={{ color: T.mute }}>{label}</span>
        <span style={{ color: T.text }}>{value}{unit}</span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: "#0A0E12" }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ============================================================================
   App
   ========================================================================== */

export default function App() {
  const ble = useMockBluetooth();
  const [isDay, setIsDay] = useState(true);
  const [sign, setSignRaw] = useState({ destination: "TAXI", seats: 4, price: 0 });
  const power = usePowerSystem(isDay, true);

  /* simulated over-the-air latency on every write */
  const setSign = useCallback((next) => {
    setTimeout(() => setSignRaw(next), 260);
  }, []);

  const stateRef = useRef({});
  stateRef.current = {
    ...sign,
    isDay,
    brightness: power.brightness,
    powered: power.powered,
    connected: ble.connected,
    locked: ble.locked,
    hasPin: ble.pin !== null,
    bleState: ble.state,
  };

  return (
    <div className="w-full min-h-screen font-sans" style={{ background: T.ink, color: T.text }}>
      <div className="flex flex-col lg:flex-row h-screen">
        {/* ── viewport ── */}
        <div className="relative flex-1 min-h-[46vh]">
          <Viewport stateRef={stateRef} />

          <div className="absolute top-5 left-5 pointer-events-none">
            <div className="text-[10px] font-mono tracking-[0.28em]" style={{ color: T.cyan }}>
              VIRTUAL PROTOTYPE · REV A
            </div>
            <h1 className="text-xl font-semibold mt-1" style={{ color: T.text }}>
              Solar Taxi Roof Sign
            </h1>
            <div className="text-[11px] mt-0.5" style={{ color: T.mute }}>
              600 × 180 × 120 mm · IP67 · 4× neodymium mount
            </div>
          </div>

          <div className="absolute top-5 right-5 flex gap-2">
            <button onClick={() => setIsDay(!isDay)}
              className="px-3 h-8 rounded-lg text-[11px] font-mono"
              style={{ background: T.panel, border: `1px solid ${T.line}`, color: T.text }}>
              {isDay ? "☀ Day" : "☾ Night"}
            </button>
          </div>

          {/* telemetry */}
          <div className="absolute bottom-5 left-5 w-56 rounded-xl p-3.5 space-y-2.5"
            style={{ background: `${T.panel}ee`, border: `1px solid ${T.line}` }}>
            <div className="text-[10px] font-mono tracking-[0.2em] pb-1" style={{ color: T.cyan }}>
              DEVICE TELEMETRY
            </div>
            <Bar label="BATTERY" value={power.battery.toFixed(0)} unit="%" pct={power.battery}
              color={power.battery > 25 ? T.green : T.red} />
            <Bar label="SOLAR IN" value={power.solarW.toFixed(1)} unit=" W" pct={(power.solarW / 6) * 100} color={T.amber} />
            <Bar label="LED DRAW" value={power.drawW.toFixed(1)} unit=" W" pct={(power.drawW / 8) * 100} color={T.ble} />
            <Bar label="BRIGHTNESS" value={power.brightness} unit="%" pct={power.brightness} color={T.cyan} />
            <div className="pt-1 text-[10px] font-mono leading-relaxed" style={{ color: T.mute }}>
              {isDay
                ? "Daylight: panel covers draw, battery charging."
                : "Night: auto-dim to 34% — small cell is enough."}
            </div>
          </div>

          <div className="absolute bottom-5 right-5 text-[10px] font-mono" style={{ color: T.mute }}>
            drag to orbit · scroll to zoom
          </div>
        </div>

        {/* ── side rail ── */}
        <div className="w-full lg:w-[340px] shrink-0 overflow-y-auto p-4 space-y-4"
          style={{ background: "#080B0E", borderLeft: `1px solid ${T.line}` }}>
          <PhoneController ble={ble} sign={sign} setSign={setSign} isDay={isDay} />

          {/* event log */}
          <div className="rounded-xl p-3" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <div className="text-[10px] font-mono tracking-[0.2em] mb-2" style={{ color: T.cyan }}>
              BLE EVENT LOG
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {ble.log.length === 0 && (
                <div className="text-[10px]" style={{ color: T.mute }}>No events yet. Start with Scan.</div>
              )}
              {ble.log.map((e) => (
                <div key={e.t + e.msg} className="text-[10px] font-mono leading-relaxed"
                  style={{ color: e.kind === "err" ? T.red : e.kind === "ok" ? T.green : T.mute }}>
                  › {e.msg}
                </div>
              ))}
            </div>
          </div>

          {/* theft walkthrough */}
          <div className="rounded-xl p-3" style={{ background: T.panel, border: `1px solid ${T.line}` }}>
            <div className="text-[10px] font-mono tracking-[0.2em] mb-2" style={{ color: T.amber }}>
              THEFT SCENARIO
            </div>
            <ol className="text-[11px] space-y-1.5 leading-relaxed" style={{ color: T.mute }}>
              <li>1 · Pair once, set a PIN, send a route.</li>
              <li>2 · Disconnect — this is the sign being taken off the roof.</li>
              <li>3 · Scan and connect again as the "new" phone.</li>
              <li>4 · Enter a wrong PIN three times.</li>
            </ol>
            <p className="text-[11px] mt-2 leading-relaxed" style={{ color: T.text }}>
              The sign refuses the link, blanks the route, and shows LOCKED. A stolen unit is a brick.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
