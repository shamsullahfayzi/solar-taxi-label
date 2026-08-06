import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Grid } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import RoofSign from "../three/RoofSign";
import CarModel from "../three/CarModel";
import { useSignStore, useSignFrame } from "../store/useSignStore";
import { useLink } from "../bluetooth/useLink";

/* Set false if @react-three/postprocessing fights your three version. */
const BLOOM = true;

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono mb-1">
        <span style={{ color: "#5C6B77" }}>{label}</span>
        <span style={{ color: "#E4ECF2" }}>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full"
        style={{ accentColor: "#3ED6D0" }}
      />
    </div>
  );
}

export default function VehiclePage() {
  const { carUrl, setCarUrl, mount, setMount, resetMount, isDay } = useSignStore();
  const frame = useSignFrame();
  const link = useLink();
  const [showMount, setShowMount] = useState(false);
  const [urlDraft, setUrlDraft] = useState(carUrl || "");

  /* Local file → blob URL, so you can test a GLB without a rebuild. */
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setCarUrl(URL.createObjectURL(f));
  };

  return (
    <div className="relative w-full h-screen" style={{ background: isDay ? "#0F141A" : "#05070A" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [9, 5.5, 11], fov: 38 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[isDay ? "#0F141A" : "#05070A"]} />
        <fog attach="fog" args={[isDay ? "#0F141A" : "#05070A", 26, 62]} />

        <Environment preset={isDay ? "city" : "night"} />
        <directionalLight
          position={[8, 12, 9]}
          intensity={isDay ? 2.2 : 0.35}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <directionalLight position={[-9, 5, -8]} intensity={isDay ? 1.0 : 0.5} color="#9FD4FF" />
        <hemisphereLight args={["#5B7183", "#090B0E", 0.5]} />

        {/* ── car.glb slot ── */}
        <CarModel url={carUrl} />

        {/* ── the sign, mounted ── */}
        <group
          position={[mount.x, mount.y, mount.z]}
          rotation={[0, mount.rotY, 0]}
          scale={mount.scale}
        >
          <RoofSign frame={frame} linkState={link.state} powered />
        </group>

        <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={22} blur={2.4} far={9} />
        <Grid
          position={[0, 0, 0]}
          args={[40, 40]}
          cellColor="#182028"
          sectionColor="#1E2A33"
          fadeDistance={38}
          infiniteGrid
        />

        <OrbitControls
          makeDefault
          target={[0, 1.4, 0]}
          minDistance={4}
          maxDistance={38}
          maxPolarAngle={Math.PI / 2.05}
          enableDamping
        />

        {BLOOM && (
          <EffectComposer disableNormalPass>
            <Bloom intensity={0.9} luminanceThreshold={0.75} luminanceSmoothing={0.3} mipmapBlur />
          </EffectComposer>
        )}
      </Canvas>

      {/* ── overlays ── */}
      <div className="absolute top-5 left-5 pointer-events-none">
        <div className="text-[10px] font-mono tracking-[0.28em]" style={{ color: "#3ED6D0" }}>
          VIRTUAL PROTOTYPE · REV A
        </div>
        <h1 className="text-xl font-semibold mt-1" style={{ color: "#E4ECF2" }}>
          Solar Taxi Roof Sign
        </h1>
        <div className="text-[11px] mt-0.5" style={{ color: "#5C6B77" }}>
          600 × 180 × 120 mm · IP67 · 4× neodymium mount
        </div>
      </div>

      <div className="absolute bottom-5 right-5 text-[10px] font-mono" style={{ color: "#4A5762" }}>
        drag to orbit · scroll to zoom
      </div>

      {/* car loader + mount alignment */}
      <div className="absolute top-5 right-5 w-72 space-y-2">
        <div className="rounded-xl p-3.5 space-y-3" style={{ background: "#101519ee", border: "1px solid #232D36" }}>
          <div className="text-[10px] font-mono tracking-[0.2em]" style={{ color: "#3ED6D0" }}>
            VEHICLE MODEL
          </div>

          <label
            className="block h-10 rounded-lg text-[11px] flex items-center justify-center cursor-pointer"
            style={{ background: "#161C22", border: "1px dashed #2A3A46", color: "#8A99A6" }}
          >
            {carUrl ? "Replace car.glb" : "Load a .glb file"}
            <input type="file" accept=".glb,.gltf" onChange={onFile} className="hidden" />
          </label>

          <div className="flex gap-1.5">
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="/models/car.glb"
              className="flex-1 h-9 px-2.5 rounded-lg text-[11px] font-mono outline-none"
              style={{ background: "#080B0E", border: "1px solid #232D36", color: "#E4ECF2" }}
            />
            <button
              onClick={() => setCarUrl(urlDraft || null)}
              className="px-3 h-9 rounded-lg text-[11px]"
              style={{ background: "#161C22", border: "1px solid #232D36", color: "#8A99A6" }}
            >
              Set
            </button>
          </div>

          {carUrl && (
            <button
              onClick={() => {
                setCarUrl(null);
                setUrlDraft("");
              }}
              className="w-full h-8 rounded-lg text-[10px]"
              style={{ background: "#161C22", border: "1px solid #232D36", color: "#5C6B77" }}
            >
              Clear — back to placeholder
            </button>
          )}
        </div>

        <div className="rounded-xl overflow-hidden" style={{ background: "#101519ee", border: "1px solid #232D36" }}>
          <button
            onClick={() => setShowMount(!showMount)}
            className="w-full px-3.5 h-11 flex items-center justify-between text-[10px] font-mono tracking-[0.2em]"
            style={{ color: "#3ED6D0" }}
          >
            MOUNT ALIGNMENT
            <span style={{ color: "#5C6B77" }}>{showMount ? "−" : "+"}</span>
          </button>
          {showMount && (
            <div className="px-3.5 pb-3.5 space-y-2.5">
              <Slider label="X · SIDE" value={mount.x} min={-3} max={3} step={0.01} onChange={(x) => setMount({ x })} />
              <Slider label="Y · HEIGHT" value={mount.y} min={0} max={4} step={0.01} onChange={(y) => setMount({ y })} />
              <Slider label="Z · FRONT/BACK" value={mount.z} min={-4} max={4} step={0.01} onChange={(z) => setMount({ z })} />
              <Slider label="ROTATION" value={mount.rotY} min={-Math.PI} max={Math.PI} step={0.01} onChange={(rotY) => setMount({ rotY })} />
              <Slider label="SCALE" value={mount.scale} min={0.2} max={3} step={0.01} onChange={(scale) => setMount({ scale })} />
              <button
                onClick={resetMount}
                className="w-full h-8 rounded-lg text-[10px]"
                style={{ background: "#161C22", border: "1px solid #232D36", color: "#5C6B77" }}
              >
                Reset
              </button>
              <p className="text-[10px] leading-relaxed" style={{ color: "#4A5762" }}>
                Every .glb has its own origin and scale. Park the sign on your roof once —
                the values are saved.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
