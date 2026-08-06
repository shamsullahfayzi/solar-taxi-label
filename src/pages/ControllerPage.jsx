import { useEffect, useRef, useState } from "react";
import { useSignStore, useSignFrame } from "../store/useSignStore";
import { useLink, LINK } from "../bluetooth/useLink";
import { drawSign, SIGN_W, SIGN_H } from "../lib/signCanvas";

/* ── copy ─────────────────────────────────────────────────────────────── */
const TXT = {
  fa: {
    connect: "وصل شدن به تابلو",
    connecting: "در حال وصل شدن…",
    pin: "رمز تابلو را وارد کنید",
    unlock: "باز کردن",
    locked: "تابلو قفل شد",
    lockedBody: "رمز اشتباه سه بار وارد شد. تابلو غیرفعال است.",
    setPin: "یک رمز چهار رقمی انتخاب کنید",
    save: "ذخیره رمز",
    fare: "کرایه",
    seats: "چوکی خالی",
    route: "مسیر را انتخاب کنید",
    afn: "افغانی",
    live: "روی تابلو",
    disconnect: "قطع",
    wrong: (n) => `رمز اشتباه — ${n} کوشش باقی مانده`,
  },
  en: {
    connect: "CONNECT TO SIGN",
    connecting: "CONNECTING…",
    pin: "ENTER SIGN PIN",
    unlock: "UNLOCK",
    locked: "SIGN LOCKED",
    lockedBody: "Three wrong PINs. The sign is disabled.",
    setPin: "CHOOSE A 4-DIGIT PIN",
    save: "SAVE PIN",
    fare: "FARE",
    seats: "SEATS FREE",
    route: "PICK A ROUTE",
    afn: "AFN",
    live: "ON THE SIGN",
    disconnect: "DISCONNECT",
    wrong: (n) => `Wrong PIN — ${n} left`,
  },
};

/* ── live mirror of the roof sign ─────────────────────────────────────── */
function SignPreview({ frame, locked }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    let raf;
    const loop = () => {
      drawSign(ctx, { ...frame, powered: true, locked }, performance.now() / 1000);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [frame, locked]);
  return (
    <canvas
      ref={ref}
      width={SIGN_W}
      height={SIGN_H}
      className="w-full rounded-xl"
      style={{ aspectRatio: `${SIGN_W}/${SIGN_H}`, background: "#04070A" }}
    />
  );
}

/* ── one big pressable ────────────────────────────────────────────────── */
function BigButton({ num, children, onClick, active, disabled, tone = "slate", className = "" }) {
  const tones = {
    slate: { bg: "#161C22", fg: "#E4ECF2", br: "#232D36" },
    amber: { bg: "#2A1F0A", fg: "#FFB020", br: "#4A3612" },
    teal: { bg: "#08201F", fg: "#3ED6D0", br: "#124542" },
    live: { bg: "#3ED6D0", fg: "#04070A", br: "#3ED6D0" },
  };
  const t = active ? tones.live : tones[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-2xl font-bold active:scale-[0.97] transition-transform disabled:opacity-25 ${className}`}
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.br}`, touchAction: "manipulation" }}
    >
      {num != null && (
        <span
          className="absolute top-2 left-2.5 text-[10px] font-mono opacity-45 leading-none"
          style={{ color: t.fg }}
        >
          {num}
        </span>
      )}
      {children}
    </button>
  );
}

/* ── PIN pad ──────────────────────────────────────────────────────────── */
function PinPad({ value, onChange, onSubmit, label, cta, danger }) {
  const press = (k) => {
    if (k === "del") return onChange(value.slice(0, -1));
    if (value.length < 4) onChange(value + k);
  };
  return (
    <div className="rounded-2xl p-4" style={{ background: "#101519", border: "1px solid #232D36" }}>
      <div className="text-xs mb-3 text-center" style={{ color: danger ? "#FF4438" : "#8A99A6" }}>
        {label}
      </div>
      <div className="flex gap-2 mb-4 justify-center">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-12 h-14 rounded-xl flex items-center justify-center text-2xl"
            style={{
              background: "#080B0E",
              border: `2px solid ${value.length === i ? "#3ED6D0" : "#232D36"}`,
              color: "#E4ECF2",
            }}
          >
            {value[i] ? "•" : ""}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "del", "0", "ok"].map((k) =>
          k === "ok" ? (
            <button
              key={k}
              onClick={onSubmit}
              disabled={value.length !== 4}
              className="h-14 rounded-xl text-sm font-bold disabled:opacity-25"
              style={{ background: "#3ED6D0", color: "#04070A" }}
            >
              ✓
            </button>
          ) : (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-14 rounded-xl text-xl font-semibold active:scale-95"
              style={{ background: "#161C22", color: "#E4ECF2", border: "1px solid #232D36" }}
            >
              {k === "del" ? "⌫" : k}
            </button>
          )
        )}
      </div>
      <div className="text-center text-[11px] mt-3" style={{ color: "#5C6B77" }}>
        {cta}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function ControllerPage() {
  const { routes, session, lang, selectRoute, nudgePrice, nudgeSeats } = useSignStore();
  const frame = useSignFrame();
  const link = useLink();
  const t = TXT[lang];
  const rtl = lang === "fa";

  const [entry, setEntry] = useState("");
  const [newPin, setNewPin] = useState("");

  /* Auto-push every change — no Send button for the driver to forget. */
  const lastSent = useRef("");
  useEffect(() => {
    if (!link.connected || link.needsPinSetup) return;
    const payload = { destination: frame.destination, seats: frame.seats, price: frame.price };
    const key = JSON.stringify(payload);
    if (key === lastSent.current) return;
    const id = setTimeout(() => {
      lastSent.current = key;
      link.write(payload);
    }, 220);
    return () => clearTimeout(id);
  }, [frame.destination, frame.seats, frame.price, link]);

  useEffect(() => {
    if (link.state !== LINK.PIN_REQUIRED) setEntry("");
  }, [link.state]);

  const busy = link.state === LINK.SCANNING || link.state === LINK.PAIRING;

  /* One tap does scan + connect. Two steps is one step too many. */
  const handleConnect = async () => {
    await link.scan();
    await link.connect();
  };

  const disabled = !link.connected || link.needsPinSetup;

  return (
    <div dir={rtl ? "rtl" : "ltr"} className="min-h-screen p-4 pb-8" style={{ background: "#080B0E" }}>
      <div className="max-w-md mx-auto space-y-4">
        {/* live mirror of the roof */}
        <div>
          <div className="text-[10px] tracking-[0.2em] mb-2" style={{ color: "#5C6B77" }}>
            {t.live}
          </div>
          <SignPreview frame={frame} locked={link.locked} />
        </div>

        {/* ── connection ── */}
        {link.state === LINK.IDLE || busy || link.state === LINK.FOUND ? (
          <BigButton
            onClick={handleConnect}
            disabled={busy}
            tone="teal"
            className="w-full h-16 text-base tracking-wider"
          >
            {busy ? t.connecting : t.connect}
          </BigButton>
        ) : null}

        {link.state === LINK.PIN_REQUIRED && (
          <PinPad
            value={entry}
            onChange={setEntry}
            onSubmit={async () => {
              const ok = await link.authenticate(entry);
              if (!ok) setEntry("");
            }}
            label={link.attempts > 0 ? t.wrong(3 - link.attempts) : t.pin}
            cta={t.unlock}
            danger={link.attempts > 0}
          />
        )}

        {link.locked && (
          <div
            className="rounded-2xl p-5 text-center"
            style={{ background: "#1A0B0B", border: "1px solid #4A1614" }}
          >
            <div className="text-base font-bold mb-1" style={{ color: "#FF4438" }}>
              {t.locked}
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "#8A99A6" }}>
              {t.lockedBody}
            </div>
          </div>
        )}

        {link.needsPinSetup && (
          <PinPad
            value={newPin}
            onChange={setNewPin}
            onSubmit={async () => {
              await link.provisionPin(newPin);
              setNewPin("");
            }}
            label={t.setPin}
            cta={t.save}
          />
        )}

        {/* ── buttons 1 / 2 / 3 — routes ── */}
        <div>
          <div className="text-[10px] tracking-[0.2em] mb-2" style={{ color: "#5C6B77" }}>
            {t.route}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {routes.map((r, i) => (
              <BigButton
                key={r.id}
                num={i + 1}
                onClick={() => selectRoute(r.id)}
                active={session.routeId === r.id}
                disabled={disabled}
                className="h-24 px-2 flex flex-col items-center justify-center gap-1"
              >
                <span className="text-sm leading-tight text-center">
                  {lang === "fa" ? r.nameFa : r.name}
                </span>
                <span className="text-[10px] font-mono opacity-55">
                  {r.price} · {r.maxSeats}
                </span>
              </BigButton>
            ))}
          </div>
        </div>

        {/* ── buttons 4 / 5 — fare, this trip only ── */}
        <div>
          <div className="text-[10px] tracking-[0.2em] mb-2" style={{ color: "#5C6B77" }}>
            {t.fare}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <BigButton
              num="4"
              onClick={() => nudgePrice(-5)}
              disabled={disabled}
              tone="amber"
              className="h-24 text-3xl"
            >
              −5
            </BigButton>
            <div
              className="col-span-2 h-24 rounded-2xl flex flex-col items-center justify-center"
              style={{ background: "#101519", border: "1px solid #232D36" }}
            >
              <span className="text-4xl font-bold font-mono" style={{ color: "#FFB020" }}>
                {session.price}
              </span>
              <span className="text-[10px] mt-0.5" style={{ color: "#5C6B77" }}>
                {t.afn}
              </span>
            </div>
            <BigButton
              num="5"
              onClick={() => nudgePrice(5)}
              disabled={disabled}
              tone="amber"
              className="h-24 text-3xl"
            >
              +5
            </BigButton>
          </div>
        </div>

        {/* ── buttons 6 / 7 — seats remaining ── */}
        <div>
          <div className="text-[10px] tracking-[0.2em] mb-2" style={{ color: "#5C6B77" }}>
            {t.seats}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <BigButton
              num="6"
              onClick={() => nudgeSeats(-1)}
              disabled={disabled}
              className="h-24 text-4xl"
            >
              −
            </BigButton>
            <div
              className="col-span-2 h-24 rounded-2xl flex items-center justify-center"
              style={{ background: "#101519", border: "1px solid #232D36" }}
            >
              <span className="text-5xl font-bold font-mono" style={{ color: "#E4ECF2" }}>
                {session.seats}
              </span>
            </div>
            <BigButton
              num="7"
              onClick={() => nudgeSeats(1)}
              disabled={disabled}
              className="h-24 text-4xl"
            >
              +
            </BigButton>
          </div>
        </div>

        {link.connected && (
          <button
            onClick={link.disconnect}
            className="w-full h-11 rounded-xl text-xs"
            style={{ background: "#101519", color: "#5C6B77", border: "1px solid #232D36" }}
          >
            {t.disconnect}
          </button>
        )}
      </div>
    </div>
  );
}
