# Solar Taxi Roof Sign — Virtual Prototype

**A phone controller and real-time 3D twin for a solar-powered LED roof sign on shared taxis.**
The driver taps a button; the sign on the roof shows the destination, the fare and how many seats are free.

![React](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)
![Three.js](https://img.shields.io/badge/Three.js-000000?logo=threedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![Web Bluetooth](https://img.shields.io/badge/Web_Bluetooth-0082FC?logo=bluetooth&logoColor=white)

<!-- Add a GIF here: pressing a controller button and the 3D sign updating -->
<!-- ![Demo](docs/demo.gif) -->

---

## Why

Shared taxis and minibuses in Afghanistan fill up by calling out destinations at the curb. Passengers can't tell from a distance where a car is going, what it costs, or whether there's room. A cheap, solar-powered sign that the driver updates in one tap fixes that — but before building hardware, the whole interaction needed proving in software.

This project is that proof: the driver's app, the sign's firmware behaviour, and the sign itself on a 3D car, all in the browser.

## What it does

| Page | Who | What |
|---|---|---|
| **Controller** | Driver | Seven big buttons: load route 1–3, fare ±5 AFN, seats ±1. Changes auto-send after ~220 ms — no "Send" button to forget |
| **Vehicle** | Demo / installer | The sign on a 3D car with glowing LEDs, live-updating. Includes mount alignment to position the sign on any `.glb` car model |
| **Settings** | Owner | Routes and default fares, seat capacity (taxi 4 → city bus 45), language, PIN, connection log |

Trip adjustments (fare, seats) never overwrite the saved route, so tomorrow starts from the defaults again.

## Engineering highlights

- **Hardware-ready seam.** All communication goes through one `Transport` interface shaped after the real Web Bluetooth API. `MockTransport` runs today; swapping in `WebBluetoothTransport` changes nothing above it.
- **A proper link state machine:** `idle → scanning → found → pairing → connected | pin_required → locked` (3 wrong PINs → 20 s lockout).
- **Security where it belongs.** The PIN is designed to be checked and rate-limited **on the ESP32**, not in the phone app — a modified app can't bypass it.
- **One renderer, two outputs.** `signCanvas.js` draws the LED matrix once and feeds both the 3D texture and the 2D preview, so they can't drift apart.
- **Parametric 3D sign** (enclosure, solar panel, feet, display, LEDs) built in React Three Fiber, with bloom post-processing for the LED glow.

## Tech stack

React 19 · Vite · React Three Fiber 9 · drei · postprocessing · Zustand (persisted state) · React Router · Tailwind CSS 4 · Oxlint

## Project structure

```
src/
  App.jsx                 router + bottom nav
  store/useSignStore.js   routes, session, mount position, language (persisted)
  bluetooth/
    transport.js          Transport interface, MockTransport, WebBluetoothTransport
    useLink.js            one shared transport across pages
  lib/signCanvas.js       LED matrix renderer (shared by 3D and 2D)
  three/
    RoofSign.jsx          parametric sign model
    CarModel.jsx          loads the car .glb
  pages/                  Controller · Vehicle · Settings
public/models/car.glb     car model
```

## Run it

```bash
git clone https://github.com/shamsullahfayzi/solar-taxi-label.git
cd solar-taxi-label
npm install
npm run dev
```

Open the URL Vite prints, ideally on a phone on the same network (`npm run dev -- --host`).
To use your own car, drop a `.glb` into `public/models/` or pick one from the Vehicle page.

> **Version note:** `@react-three/fiber` v9 requires React 19, and `drei` v10 requires fiber v9. Mixing majors causes `ERESOLVE` errors — fix the versions rather than using `--legacy-peer-deps`. More detail in [`src/README.md`](src/README.md).

## Next step

Flash an ESP32 driving the LED matrix, implement the GATT service the `Transport` interface already describes, and switch to `WebBluetoothTransport`.

## Author

**Shamsullah Fayzi** · [GitHub](https://github.com/shamsullahfayzi)
