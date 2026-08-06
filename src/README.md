# Solar Taxi Roof Sign — virtual prototype

Three pages: **Controller** (driver), **Vehicle** (3D), **Settings** (config).

## Install

```bash
npm create vite@latest roofsign -- --template react
cd roofsign

# React 19 — required by @react-three/fiber v9
npm install react@^19 react-dom@^19

# 3D
npm install three @react-three/fiber@^9 @react-three/drei@^10
npm install @react-three/postprocessing postprocessing

# state + routing
npm install zustand react-router-dom

# styling
npm install -D tailwindcss @tailwindcss/vite
```

`vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [react(), tailwindcss()] });
```

`src/index.css`:

```css
@import "tailwindcss";
```

### Version pairing — the one thing that breaks builds

`@react-three/fiber` is a React renderer, so its major version is pinned to React's:
**v8 ↔ React 18**, **v9 ↔ React 19**. `drei` follows: **v9 ↔ fiber 8**, **v10 ↔ fiber 9**.
Mixing them produces `ERESOLVE` peer-dependency errors. Don't reach for
`--legacy-peer-deps` — fix the versions instead.

If `@react-three/postprocessing` fights your `three` version, set `BLOOM = false`
at the top of `VehiclePage.jsx`. Everything else keeps working; the LEDs just
lose their glow.

## Files

```
src/
  App.jsx                      router + bottom nav
  store/useSignStore.js        routes, session, mount, language (persisted)
  bluetooth/
    transport.js               Transport interface, MockTransport, WebBluetoothTransport stub
    useLink.js                 one shared transport instance across pages
  lib/signCanvas.js            LED matrix draw — used by both 3D texture and 2D preview
  three/
    RoofSign.jsx               parametric enclosure, solar, feet, display, LEDs
    CarModel.jsx               ← your car.glb goes here
  pages/
    ControllerPage.jsx         seven buttons
    VehiclePage.jsx            3D scene + mount alignment
    SettingsPage.jsx           routes, language, PIN, log
```

## Adding your car

Drop the file at `public/models/car.glb`, then either set the path on the Vehicle
page or edit `DEFAULT_CAR_URL` in `three/CarModel.jsx`. The file picker on the
Vehicle page also accepts a local `.glb` via blob URL for quick testing.

Open **Mount alignment** and park the sign on the roof. Values persist.

## Controller button map

| # | Action | Scope |
|---|--------|-------|
| 1–3 | Load route — sets destination, default fare, full seats | route defaults |
| 4 | Fare − 5 AFN | this trip only |
| 5 | Fare + 5 AFN | this trip only |
| 6 | Seats − 1 | this trip only |
| 7 | Seats + 1 | this trip only |

Buttons 4–7 never write back to the saved route, so tomorrow's default fare is
untouched. Changes auto-push to the sign after ~220 ms — there's no Send button
to forget.

Seat capacity is unbounded. Set it per route in Settings; presets cover taxi (4)
through city bus (45). Above 8 the sign drops the seat pips and shows the number
alone.

## Moving to hardware

`useLink.js` is the seam. Replace `MockTransport` with `WebBluetoothTransport`
and nothing above it changes.

**The PIN check must live on the ESP32.** If the phone app validates it, someone
flashes a modified APK and walks straight past your security layer. The board
holds the PIN in NVS, counts failed attempts itself, and enforces its own
lockout — the phone only submits a candidate and reads back a yes or no.
