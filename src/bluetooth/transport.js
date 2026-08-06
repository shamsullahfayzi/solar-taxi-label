/**
 * Transport interface — shaped after the real Web Bluetooth API so that
 * MockTransport and WebBluetoothTransport are drop-in interchangeable.
 *
 *   scan()             → Promise<void>   discover the sign
 *   connect()          → Promise<void>   open the GATT link
 *   authenticate(pin)  → Promise<bool>   send PIN to the sign
 *   provisionPin(pin)  → Promise<void>   first-pair PIN enrolment
 *   write(payload)     → Promise<void>   push { destination, seats, price }
 *   clearPin()         → Promise<void>   factory reset (authenticated only)
 *   disconnect()       → void
 *
 * State machine:
 *   idle → scanning → found → pairing → { connected | pin_required }
 *   pin_required --3 wrong--> locked --20s--> idle
 */

export const LINK = {
  IDLE: "idle",
  SCANNING: "scanning",
  FOUND: "found",
  PAIRING: "pairing",
  PIN_REQUIRED: "pin_required",
  CONNECTED: "connected",
  LOCKED: "locked",
};

const PIN_KEY = "roofsign-device-pin"; // stands in for the sign's NVS flash
const LOCKOUT_MS = 20000;
const MAX_ATTEMPTS = 3;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class MockTransport extends EventTarget {
  constructor(deviceName = "ROOFSIGN-A31F") {
    super();
    this.deviceName = deviceName;
    this.state = LINK.IDLE;
    this.attempts = 0;
    this.rssi = -70;
    this.log = [];
    this._timers = [];
  }

  /* ── PIN lives on the "device", not the phone ──────────────────────── */
  get pin() {
    try {
      return localStorage.getItem(PIN_KEY);
    } catch {
      return this._pin ?? null;
    }
  }
  set pin(v) {
    try {
      v === null ? localStorage.removeItem(PIN_KEY) : localStorage.setItem(PIN_KEY, v);
    } catch {
      this._pin = v;
    }
  }
  get isProvisioned() {
    return this.pin !== null;
  }

  _emit() {
    this.dispatchEvent(new Event("change"));
  }
  _set(state) {
    this.state = state;
    this._emit();
  }
  _log(msg, kind = "info") {
    this.log = [{ id: Date.now() + Math.random(), msg, kind }, ...this.log].slice(0, 40);
    this._emit();
  }
  _later(ms, fn) {
    this._timers.push(setTimeout(fn, ms));
  }
  destroy() {
    this._timers.forEach(clearTimeout);
  }

  async scan() {
    if (this.state !== LINK.IDLE) return;
    this._set(LINK.SCANNING);
    this._log("Scanning for nearby signs…");
    await wait(1300);
    this.rssi = -50 - Math.floor(Math.random() * 14);
    this._set(LINK.FOUND);
    this._log(`Found ${this.deviceName}`);
  }

  async connect() {
    if (this.state !== LINK.FOUND) return;
    this._set(LINK.PAIRING);
    this._log("Negotiating GATT link…");
    await wait(1000);
    if (!this.isProvisioned) {
      this._set(LINK.CONNECTED);
      this._log("First pairing — no PIN on record", "ok");
    } else {
      this._set(LINK.PIN_REQUIRED);
      this._log("Known sign — PIN required");
    }
  }

  async authenticate(entry) {
    if (this.state !== LINK.PIN_REQUIRED) return false;
    await wait(350);
    if (entry === this.pin) {
      this.attempts = 0;
      this._set(LINK.CONNECTED);
      this._log("PIN accepted — sign unlocked", "ok");
      return true;
    }
    this.attempts += 1;
    if (this.attempts >= MAX_ATTEMPTS) {
      this._set(LINK.LOCKED);
      this._log(`${MAX_ATTEMPTS} failed attempts — sign locked`, "err");
      this._later(LOCKOUT_MS, () => {
        this.attempts = 0;
        this._set(LINK.IDLE);
        this._log("Lockout expired");
      });
    } else {
      const left = MAX_ATTEMPTS - this.attempts;
      this._log(`Wrong PIN — ${left} attempt${left === 1 ? "" : "s"} left`, "err");
      this._emit();
    }
    return false;
  }

  async provisionPin(pin) {
    if (this.state !== LINK.CONNECTED) throw new Error("not connected");
    await wait(250);
    this.pin = pin;
    this._log("PIN saved to sign. Future pairings will require it.", "ok");
  }

  async clearPin() {
    // Only an already-authenticated phone may reset — otherwise a thief
    // would simply factory-reset their way past the lock.
    if (this.state !== LINK.CONNECTED) {
      this._log("Reset refused — authenticate first", "err");
      return;
    }
    this.pin = null;
    this._log("PIN cleared. Sign is back to factory state.");
    this._emit();
  }

  async write(payload) {
    if (this.state !== LINK.CONNECTED) return;
    await wait(180); // simulated OTA latency
    this._log(
      `TX  dest="${payload.destination ?? "—"}"  seats=${payload.seats}  fare=${payload.price}`
    );
  }

  disconnect() {
    this._set(LINK.IDLE);
    this._log("Disconnected");
  }
}

/**
 * Real hardware. Swap this in and nothing above the transport changes.
 * NOTE: the PIN check must run on the ESP32 itself. If the phone app
 * validates it, a modified APK walks straight past your security layer.
 */
export class WebBluetoothTransport extends EventTarget {
  static SERVICE = "0000a100-0000-1000-8000-00805f9b34fb";
  static CHAR_CTRL = "0000a101-0000-1000-8000-00805f9b34fb";
  static CHAR_AUTH = "0000a102-0000-1000-8000-00805f9b34fb";

  async scan() {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [WebBluetoothTransport.SERVICE] }],
    });
  }
  async connect() {
    this.server = await this.device.gatt.connect();
    this.service = await this.server.getPrimaryService(WebBluetoothTransport.SERVICE);
  }
  async authenticate(pin) {
    const c = await this.service.getCharacteristic(WebBluetoothTransport.CHAR_AUTH);
    await c.writeValue(new TextEncoder().encode(pin));
    const res = await c.readValue();
    return res.getUint8(0) === 1;
  }
  async write(payload) {
    const c = await this.service.getCharacteristic(WebBluetoothTransport.CHAR_CTRL);
    await c.writeValue(new TextEncoder().encode(JSON.stringify(payload)));
  }
  disconnect() {
    this.device?.gatt?.disconnect();
  }
}
