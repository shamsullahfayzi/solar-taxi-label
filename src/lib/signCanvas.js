/**
 * The sign's LED matrix, drawn to any 2D context.
 * Used twice: as a CanvasTexture in the 3D scene, and as a live preview
 * on the controller so the driver sees exactly what the roof shows.
 */

export const SIGN_W = 1024;
export const SIGN_H = 240;

export const AMBER = "#FFB020";
export const RED = "#FF4438";

const isRTL = (s) => /[\u0600-\u06FF]/.test(s || "");

let gridCache = null;
function pixelGrid() {
  if (gridCache) return gridCache;
  const c = document.createElement("canvas");
  c.width = SIGN_W;
  c.height = SIGN_H;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.42)";
  for (let x = 0; x < SIGN_W; x += 4) g.fillRect(x, 0, 1.4, SIGN_H);
  for (let y = 0; y < SIGN_H; y += 4) g.fillRect(0, y, SIGN_W, 1.4);
  gridCache = c;
  return c;
}

/** Shrink the font until the string fits the box. Handles 3-digit bus seats. */
function fitFont(ctx, text, maxW, startPx, family) {
  let px = startPx;
  do {
    ctx.font = `700 ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    px -= 4;
  } while (px > 22);
  return px;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{destination:string|null, seats:number, price:number, maxSeats:number,
 *          brightness:number, powered:boolean, locked:boolean}} s
 * @param {number} time seconds, drives scrolling + blink
 */
export function drawSign(ctx, s, time) {
  const MONO = "ui-monospace, Menlo, Consolas, monospace";
  const ARABIC = '"Segoe UI", Tahoma, Arial, sans-serif';

  ctx.clearRect(0, 0, SIGN_W, SIGN_H);
  ctx.fillStyle = "#04070A";
  ctx.fillRect(0, 0, SIGN_W, SIGN_H);

  if (s.powered === false) {
    ctx.drawImage(pixelGrid(), 0, 0);
    return;
  }

  const a = Math.max(0.05, (s.brightness ?? 100) / 100);

  /* ── locked: refuse to advertise anything ── */
  if (s.locked) {
    const blink = Math.sin(time * 7) > -0.2 ? 1 : 0.22;
    ctx.globalAlpha = a * blink;
    ctx.fillStyle = RED;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 92px ${MONO}`;
    ctx.fillText("· LOCKED ·", SIGN_W / 2, SIGN_H / 2 - 10);
    ctx.font = `600 28px ${MONO}`;
    ctx.fillText("UNAUTHORISED CONTROLLER", SIGN_W / 2, SIGN_H / 2 + 60);
    ctx.globalAlpha = 1;
    ctx.drawImage(pixelGrid(), 0, 0);
    return;
  }

  /* ── idle: no route chosen yet ── */
  if (!s.destination) {
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = AMBER;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 84px ${MONO}`;
    ctx.fillText("TAXI", SIGN_W / 2, SIGN_H / 2);
    ctx.globalAlpha = 1;
    ctx.drawImage(pixelGrid(), 0, 0);
    return;
  }

  ctx.globalAlpha = a;
  ctx.fillStyle = AMBER;

  const label = (txt, x) => {
    ctx.globalAlpha = a * 0.5;
    ctx.font = `600 22px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.letterSpacing = "3px";
    ctx.fillText(txt, x, 28);
    ctx.letterSpacing = "0px";
    ctx.globalAlpha = a;
  };

  const dividers = [568, 792];
  ctx.globalAlpha = a * 0.26;
  dividers.forEach((x) => ctx.fillRect(x, 24, 3, SIGN_H - 48));
  ctx.globalAlpha = a;

  /* ── zone A · destination, scrolls when it overflows ── */
  label("DESTINATION", 26);
  const zx = 26;
  const zw = 520;
  ctx.save();
  ctx.beginPath();
  ctx.rect(zx, 70, zw, 140);
  ctx.clip();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const rtl = isRTL(s.destination);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.font = `700 ${rtl ? 76 : 80}px ${rtl ? ARABIC : MONO}`;
  const tw = ctx.measureText(s.destination).width;
  if (tw > zw) {
    const period = tw + 90;
    const off = (time * 62) % period;
    ctx.fillText(s.destination, zx - off, 142);
    ctx.fillText(s.destination, zx - off + period, 142);
  } else {
    ctx.fillText(s.destination, zx, 142);
  }
  ctx.restore();
  ctx.direction = "ltr";

  /* ── zone B · seats (unbounded — pips only for small vehicles) ── */
  label("SEATS", 592);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const seatStr = String(s.seats);
  const showPips = s.maxSeats > 0 && s.maxSeats <= 8;
  const seatBoxW = showPips ? 96 : 180;
  fitFont(ctx, seatStr, seatBoxW, 88, MONO);
  ctx.fillText(seatStr, 592, 142);
  if (showPips) {
    for (let i = 0; i < s.maxSeats; i++) {
      ctx.globalAlpha = i < s.seats ? a : a * 0.15;
      ctx.fillRect(700 + i * 22, 118, 14, 46);
    }
    ctx.globalAlpha = a;
  }

  /* ── zone C · fare ── */
  label("FARE", 816);
  fitFont(ctx, String(s.price), 190, 74, MONO);
  ctx.fillText(String(s.price), 816, 134);
  ctx.globalAlpha = a * 0.6;
  ctx.font = `600 24px ${MONO}`;
  ctx.fillText("AFN", 816, 190);

  ctx.globalAlpha = 1;
  ctx.drawImage(pixelGrid(), 0, 0);
}
