import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { drawSign, SIGN_W, SIGN_H } from "../lib/signCanvas";
import { LINK } from "../bluetooth/transport";

/* Enclosure dimensions, 1 unit = 100 mm. Change these, everything follows. */
export const DEV = { W: 6.0, H: 1.8, D: 1.2, R: 0.28, BEV: 0.05 };
const FRONT_Z = DEV.D / 2 + DEV.BEV;
const TOP_Y = DEV.H / 2 + DEV.BEV;
const SCREEN_W = 5.32;
const SCREEN_H = (SCREEN_W * SIGN_H) / SIGN_W;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
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
  c.width = 1024;
  c.height = 200;
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
    for (let b = 1; b < 4; b++) {
      g.beginPath();
      g.moveTo(x + b * 29, 8);
      g.lineTo(x + b * 29, 192);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} frame  from useSignFrame()
 * @param {string} linkState  LINK.* — drives the status strip + BLE LED
 */
export default function RoofSign({ frame, linkState = LINK.IDLE, powered = true, ...props }) {
  const shellGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedRect(DEV.W, DEV.H, DEV.R), {
      depth: DEV.D,
      bevelEnabled: true,
      bevelThickness: DEV.BEV,
      bevelSize: DEV.BEV,
      bevelSegments: 4,
      curveSegments: 16,
    });
    g.center();
    return g;
  }, []);

  const solarMap = useMemo(makeSolarTexture, []);

  const { canvas, ctx, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = SIGN_W;
    c.height = SIGN_H;
    const x = c.getContext("2d");
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, ctx: x, texture: t };
  }, []);

  const stripRef = useRef();
  const ledRefs = { power: useRef(), ble: useRef(), lock: useRef() };

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    drawSign(ctx, { ...frame, powered, locked: linkState === LINK.LOCKED }, t);
    texture.needsUpdate = true;

    /* status strip colour follows the link state */
    let col = 0x101820;
    let amt = 0.1;
    if (linkState === LINK.SCANNING || linkState === LINK.PAIRING) {
      col = 0x2e9bff;
      amt = 0.4 + 0.6 * Math.abs(Math.sin(t * 5));
    } else if (linkState === LINK.PIN_REQUIRED) {
      col = 0xffb020;
      amt = 0.5 + 0.5 * Math.abs(Math.sin(t * 3));
    } else if (linkState === LINK.LOCKED) {
      col = 0xff4438;
      amt = Math.sin(t * 7) > 0 ? 1 : 0.12;
    } else if (linkState === LINK.CONNECTED) {
      col = 0x3ed6d0;
      amt = 0.85;
    }
    if (stripRef.current) {
      stripRef.current.color.setHex(col).multiplyScalar(powered ? amt : 0);
    }

    const level = {
      power: powered ? (frame.isDay ? 1 : 0.5) : 0,
      ble:
        linkState === LINK.CONNECTED
          ? 1
          : linkState === LINK.IDLE
          ? 0.05
          : Math.abs(Math.sin(t * 5)),
      lock: linkState === LINK.LOCKED ? (Math.sin(t * 7) > 0 ? 1 : 0.05) : 0.28,
    };
    Object.entries(ledRefs).forEach(([k, ref]) => {
      if (ref.current) ref.current.emissiveIntensity = 0.2 + level[k] * 3.2;
    });
  });

  const bezelPositions = [1, -1];

  return (
    <group {...props}>
      {/* enclosure */}
      <mesh geometry={shellGeo} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#23292F"
          metalness={0.35}
          roughness={0.42}
          clearcoat={0.85}
          clearcoatRoughness={0.25}
        />
      </mesh>

      {/* IP67 parting-line gasket between top and bottom shells */}
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[DEV.W - 0.1, 0.05, DEV.D + 0.115]} />
        <meshStandardMaterial color="#0D1013" roughness={0.95} />
      </mesh>

      {/* double-sided LED display */}
      {bezelPositions.map((dir) => (
        <group key={dir} rotation={[0, dir < 0 ? Math.PI : 0, 0]}>
          <mesh position={[0, 0.02, FRONT_Z + 0.004]}>
            <planeGeometry args={[SCREEN_W + 0.16, SCREEN_H + 0.16]} />
            <meshPhysicalMaterial color="#05070A" metalness={0.2} roughness={0.12} clearcoat={1} />
          </mesh>
          <mesh position={[0, 0.02, FRONT_Z + 0.012]}>
            <planeGeometry args={[SCREEN_W, SCREEN_H]} />
            <meshBasicMaterial map={texture} toneMapped={false} />
          </mesh>
          {/* RGB status strip */}
          <mesh position={[0, -0.74, FRONT_Z + 0.012]}>
            <planeGeometry args={[SCREEN_W, 0.085]} />
            <meshBasicMaterial ref={dir === 1 ? stripRef : undefined} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* solar panel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TOP_Y + 0.003, -0.09]}>
        <planeGeometry args={[5.3, 0.82]} />
        <meshPhysicalMaterial
          map={solarMap}
          metalness={0.35}
          roughness={0.14}
          clearcoat={1}
          clearcoatRoughness={0.05}
        />
      </mesh>

      {/* indicator LEDs: power / bluetooth / lock */}
      {[
        ["power", "#3ADB7C", -2.44],
        ["ble", "#2E9BFF", -2.2],
        ["lock", "#FF4438", -1.96],
      ].map(([key, color, x]) => (
        <mesh key={key} position={[x, TOP_Y + 0.012, 0.44]}>
          <sphereGeometry args={[0.052, 16, 12]} />
          <meshStandardMaterial
            ref={ledRefs[key]}
            color={color}
            emissive={color}
            emissiveIntensity={1}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* neodymium mounting feet + rubber isolation pads */}
      {[
        [-2.3, 0.34],
        [2.3, 0.34],
        [-2.3, -0.34],
        [2.3, -0.34],
      ].map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, -TOP_Y - 0.06, z]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.12, 24]} />
            <meshPhysicalMaterial color="#8A949C" metalness={1} roughness={0.28} />
          </mesh>
          <mesh position={[x, -TOP_Y - 0.17, z]} castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.12, 24]} />
            <meshStandardMaterial color="#101418" roughness={0.88} />
          </mesh>
        </group>
      ))}

      {/* security tether eyelet */}
      <mesh position={[2.72, -TOP_Y - 0.05, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.13, 0.035, 10, 24]} />
        <meshPhysicalMaterial color="#8A949C" metalness={1} roughness={0.28} />
      </mesh>
    </group>
  );
}
