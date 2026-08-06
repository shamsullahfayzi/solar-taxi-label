import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Three route slots map to buttons 1 / 2 / 3 on the controller.
 * `maxSeats` has no upper bound — set it to 4 for a taxi, 45 for a bus.
 */
const DEFAULT_ROUTES = [
  { id: 1, name: "KARTE NAW", nameFa: "کارته نو", price: 30, maxSeats: 4 },
  { id: 2, name: "DEH BURI", nameFa: "دهبوری", price: 25, maxSeats: 4 },
  { id: 3, name: "KHAIR KHANA", nameFa: "خیرخانه", price: 50, maxSeats: 4 },
];

/** Where the sign sits on your car.glb. Tune live on the Vehicle page. */
const DEFAULT_MOUNT = { x: 0, y: 1.55, z: 0.1, rotY: 0, scale: 1 };

export const useSignStore = create(
  persist(
    (set, get) => ({
      /* ── configuration ───────────────────────────────────────────── */
      routes: DEFAULT_ROUTES,
      lang: "fa", // 'fa' | 'en'
      isDay: true,
      carUrl: null, // e.g. "/models/car.glb" — set on the Vehicle page
      mount: DEFAULT_MOUNT,

      /* ── live session (what the sign is showing right now) ────────── */
      session: { routeId: null, price: 0, seats: 0 },

      /* ── actions ─────────────────────────────────────────────────── */

      /** Buttons 1/2/3 — load a route at its default price and full seats. */
      selectRoute: (id) => {
        const r = get().routes.find((x) => x.id === id);
        if (!r) return;
        set({ session: { routeId: id, price: r.price, seats: r.maxSeats } });
      },

      /**
       * Buttons 4/5 — session-only fare change. Deliberately does NOT touch
       * routes[].price, so tomorrow's default fare is unaffected.
       */
      nudgePrice: (delta) =>
        set((s) => ({
          session: { ...s.session, price: Math.max(0, s.session.price + delta) },
        })),

      /** Buttons 6/7 — seats remaining, clamped to this route's capacity. */
      nudgeSeats: (delta) =>
        set((s) => {
          const r = s.routes.find((x) => x.id === s.session.routeId);
          const cap = r ? r.maxSeats : Infinity;
          return {
            session: {
              ...s.session,
              seats: Math.max(0, Math.min(cap, s.session.seats + delta)),
            },
          };
        }),

      clearSession: () => set({ session: { routeId: null, price: 0, seats: 0 } }),

      updateRoute: (id, patch) =>
        set((s) => ({
          routes: s.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      setLang: (lang) => set({ lang }),
      setIsDay: (isDay) => set({ isDay }),
      setCarUrl: (carUrl) => set({ carUrl }),
      setMount: (patch) => set((s) => ({ mount: { ...s.mount, ...patch } })),
      resetMount: () => set({ mount: DEFAULT_MOUNT }),
    }),
    { name: "roofsign-v1" }
  )
);

/** Derived: exactly what the physical sign should be rendering. */
export function useSignFrame() {
  const { routes, session, lang, isDay } = useSignStore();
  const route = routes.find((r) => r.id === session.routeId) || null;
  return {
    destination: route ? (lang === "fa" ? route.nameFa : route.name) : null,
    seats: session.seats,
    price: session.price,
    maxSeats: route ? route.maxSeats : 0,
    brightness: isDay ? 100 : 34,
    isDay,
    lang,
  };
}
