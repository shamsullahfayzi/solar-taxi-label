import { useSyncExternalStore, useMemo } from "react";
import { MockTransport, LINK, WebBluetoothTransport } from "./transport";

/** One transport for the whole app, so the link survives page navigation. */
export const transport = new MockTransport();

// Swap for the real thing when the board exists:
// export const transport = new WebBluetoothTransport();

function subscribe(cb) {
  transport.addEventListener("change", cb);
  return () => transport.removeEventListener("change", cb);
}

// A monotonic snapshot key — the transport mutates in place, so we version it.
let version = 0;
transport.addEventListener("change", () => {
  version += 1;
});
const getSnapshot = () => version;

export function useLink() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      state: transport.state,
      attempts: transport.attempts,
      rssi: transport.rssi,
      log: transport.log,
      deviceName: transport.deviceName,
      isProvisioned: transport.isProvisioned,
      connected: transport.state === LINK.CONNECTED,
      locked: transport.state === LINK.LOCKED,
      needsPinSetup: transport.state === LINK.CONNECTED && !transport.isProvisioned,

      scan: () => transport.scan(),
      connect: () => transport.connect(),
      authenticate: (p) => transport.authenticate(p),
      provisionPin: (p) => transport.provisionPin(p),
      clearPin: () => transport.clearPin(),
      write: (p) => transport.write(p),
      disconnect: () => transport.disconnect(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, transport.state, transport.attempts, transport.log]
  );
}

export { LINK };
