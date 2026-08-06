import { useSignStore } from "../store/useSignStore";
import { useLink } from "../bluetooth/useLink";

const VEHICLE_PRESETS = [
  { label: "Corolla / taxi", seats: 5 },
  { label: "HiAce van", seats: 14 },
  { label: "Coaster", seats: 24 },
  { label: "City bus", seats: 45 },
];

function Field({ label, children, hint }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.18em] mb-1.5" style={{ color: "#5C6B77" }}>
        {label}
      </div>
      {children}
      {hint && (
        <div className="text-[10px] mt-1.5 leading-relaxed" style={{ color: "#4A5762" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  background: "#080B0E",
  border: "1px solid #232D36",
  color: "#E4ECF2",
};

export default function SettingsPage() {
  const { routes, lang, isDay, updateRoute, setLang, setIsDay } = useSignStore();
  const link = useLink();

  return (
    <div className="min-h-screen p-4 pb-10" style={{ background: "#080B0E" }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-lg font-semibold pt-2" style={{ color: "#E4ECF2" }}>
          Settings
        </h1>

        {/* ── route slots ── */}
        <div className="rounded-2xl p-4" style={{ background: "#101519", border: "1px solid #232D36" }}>
          <div className="text-[10px] tracking-[0.2em] mb-1" style={{ color: "#3ED6D0" }}>
            ROUTE SLOTS
          </div>
          <p className="text-[11px] mb-4 leading-relaxed" style={{ color: "#5C6B77" }}>
            These fill buttons 1, 2 and 3 on the controller. Picking a route loads its
            default fare and fills every seat.
          </p>

          <div className="space-y-4">
            {routes.map((r, i) => (
              <div key={r.id} className="rounded-xl p-3" style={{ background: "#0B0F13", border: "1px solid #1B242C" }}>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: "#161C22", color: "#3ED6D0" }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-xs" style={{ color: "#8A99A6" }}>
                    Button {i + 1}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="NAME · ENGLISH">
                    <input
                      value={r.name}
                      onChange={(e) => updateRoute(r.id, { name: e.target.value.toUpperCase() })}
                      className="w-full h-10 px-3 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="نام · دری">
                    <input
                      dir="rtl"
                      value={r.nameFa}
                      onChange={(e) => updateRoute(r.id, { nameFa: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="DEFAULT FARE · AFN">
                    <input
                      type="number"
                      min={0}
                      value={r.price}
                      onChange={(e) => updateRoute(r.id, { price: Math.max(0, +e.target.value || 0) })}
                      className="w-full h-10 px-3 rounded-lg text-sm font-mono outline-none"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="SEAT CAPACITY">
                    <input
                      type="number"
                      min={1}
                      value={r.maxSeats}
                      onChange={(e) => updateRoute(r.id, { maxSeats: Math.max(1, +e.target.value || 1) })}
                      className="w-full h-10 px-3 rounded-lg text-sm font-mono outline-none"
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {VEHICLE_PRESETS.map((v) => (
                    <button
                      key={v.label}
                      onClick={() => updateRoute(r.id, { maxSeats: v.seats })}
                      className="px-2.5 py-1 rounded-lg text-[10px]"
                      style={{
                        background: r.maxSeats === v.seats ? "#08201F" : "#161C22",
                        border: `1px solid ${r.maxSeats === v.seats ? "#124542" : "#232D36"}`,
                        color: r.maxSeats === v.seats ? "#3ED6D0" : "#6C7B87",
                      }}
                    >
                      {v.label} · {v.seats}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── display ── */}
        <div className="rounded-2xl p-4 space-y-4" style={{ background: "#101519", border: "1px solid #232D36" }}>
          <div className="text-[10px] tracking-[0.2em]" style={{ color: "#3ED6D0" }}>
            DISPLAY
          </div>

          <Field label="SIGN LANGUAGE" hint="Which name the roof sign shows. The controller UI follows it too.">
            <div className="flex gap-2">
              {[
                ["fa", "دری"],
                ["en", "English"],
              ].map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setLang(k)}
                  className="flex-1 h-11 rounded-xl text-sm"
                  style={{
                    background: lang === k ? "#3ED6D0" : "#161C22",
                    color: lang === k ? "#04070A" : "#8A99A6",
                    border: "1px solid #232D36",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="AMBIENT"
            hint="Night drops LED output to 34%. That's the whole reason a small cell is enough after dark."
          >
            <div className="flex gap-2">
              {[
                [true, "☀ Day · 100%"],
                [false, "☾ Night · 34%"],
              ].map(([k, v]) => (
                <button
                  key={String(k)}
                  onClick={() => setIsDay(k)}
                  className="flex-1 h-11 rounded-xl text-sm"
                  style={{
                    background: isDay === k ? "#3ED6D0" : "#161C22",
                    color: isDay === k ? "#04070A" : "#8A99A6",
                    border: "1px solid #232D36",
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* ── security ── */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "#101519", border: "1px solid #232D36" }}>
          <div className="text-[10px] tracking-[0.2em]" style={{ color: "#FFB020" }}>
            SECURITY
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: "#E4ECF2" }}>
                Sign PIN
              </div>
              <div className="text-[11px]" style={{ color: "#5C6B77" }}>
                {link.isProvisioned ? "Set — required on every new pairing" : "Not set — next pairing is open"}
              </div>
            </div>
            <button
              onClick={link.clearPin}
              disabled={!link.connected}
              className="px-3 h-9 rounded-lg text-[11px] disabled:opacity-30"
              style={{ background: "#161C22", border: "1px solid #232D36", color: "#8A99A6" }}
            >
              Clear PIN
            </button>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "#4A5762" }}>
            Clearing only works while an authenticated phone is connected — otherwise a thief
            would factory-reset straight past the lock.
          </p>
        </div>

        {/* ── log ── */}
        <div className="rounded-2xl p-4" style={{ background: "#101519", border: "1px solid #232D36" }}>
          <div className="text-[10px] tracking-[0.2em] mb-2" style={{ color: "#3ED6D0" }}>
            BLE EVENT LOG
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {link.log.length === 0 && (
              <div className="text-[11px]" style={{ color: "#4A5762" }}>
                Nothing yet. Connect from the Controller page.
              </div>
            )}
            {link.log.map((e) => (
              <div
                key={e.id}
                className="text-[10px] font-mono leading-relaxed"
                style={{ color: e.kind === "err" ? "#FF4438" : e.kind === "ok" ? "#3ADB7C" : "#5C6B77" }}
              >
                › {e.msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
