import { Suspense, useMemo } from "react";
import { useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";

/* ══════════════════════════════════════════════════════════════════════════
   YOUR CAR GOES HERE
   ──────────────────────────────────────────────────────────────────────────
   1. Drop your file at:  public/models/car.glb
   2. Either set carUrl on the Vehicle page, or hardcode it below.
   3. Nudge the sign into place with the Mount panel on the Vehicle page.

   If your model loads at the wrong size, fix the scale in Blender and
   re-export rather than scaling here — a scaled parent makes the mount
   offsets meaningless once you swap models again.
   ══════════════════════════════════════════════════════════════════════════ */
export const DEFAULT_CAR_URL = "/models/car.glb"; // e.g. "/models/car.glb"

/* Exported models don't always sit on the origin — re-center X/Z and drop
   the base to y=0 so the car lands under the sign regardless of how its
   pivot was authored. */
function LoadedCar({ url }) {
  const { scene } = useGLTF(url);
  useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    scene.position.x -= (box.min.x + box.max.x) / 2;
    scene.position.z -= (box.min.z + box.max.z) / 2;
    scene.position.y -= box.min.y;
  }, [scene]);
  return <primitive object={scene} />;
}

/** Stand-in body so the scene reads correctly before the GLB exists. */
function Placeholder({ loading }) {
  return (
    <group>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[4.4, 1.24, 10.4]} />
        <meshBasicMaterial color="#2A3A46" wireframe />
      </mesh>
      <mesh position={[0, 1.42, -0.4]}>
        <boxGeometry args={[3.9, 1.0, 4.8]} />
        <meshBasicMaterial color="#2A3A46" wireframe />
      </mesh>
      <Html center position={[0, 3.4, 0]} distanceFactor={16}>
        <div
          style={{
            whiteSpace: "nowrap",
            fontFamily: "ui-monospace, monospace",
            fontSize: 12,
            letterSpacing: "0.14em",
            color: loading ? "#3ED6D0" : "#6C7B87",
            border: "1px dashed #2A3A46",
            borderRadius: 8,
            padding: "6px 12px",
            background: "rgba(8,11,14,0.85)",
            pointerEvents: "none",
          }}
        >
          {loading ? "LOADING car.glb…" : "car.glb placeholder — empty"}
        </div>
      </Html>
    </group>
  );
}

export default function CarModel({ url = DEFAULT_CAR_URL }) {
  if (!url) return <Placeholder />;
  return (
    <Suspense fallback={<Placeholder loading />}>
      <LoadedCar url={url} />
    </Suspense>
  );
}
