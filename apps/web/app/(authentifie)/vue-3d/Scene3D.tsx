"use client";

import { useRef, useState, Suspense } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { ZoneVue3D, IdZone, StatutZone } from "../../../lib/vue3d";

useGLTF.preload("/models/Building_Large_2.gltf");
useGLTF.preload("/models/Building_Medium_2_001.gltf");
useGLTF.preload("/models/Building_Small_1.gltf");
useGLTF.preload("/models/Street_Asphalt_9x9.gltf");

const PALETTE: Record<string, string> = {
  MI_RedBrick:           "#b05040",
  MI_RedBrick_Pale:      "#c06858",
  MI_Concrete:           "#c8bca8",
  MI_Trim:               "#d4c4a8",
  MI_Trim_Dark:          "#8a7a68",
  MI_Trim_Green:         "#7a9870",
  MI_Trim_MetalConcrete: "#c8bca8",
  MI_Glass:              "#4a6880",
  MI_FakeInterior_1:     "#1a2a3a",
  MI_FakeInterior_2:     "#1a2a3a",
  MI_FakeInterior_3:     "#1a2a3a",
  MI_FakeInterior_4:     "#1a2a3a",
  MI_InteriorWall:       "#e0d8cc",
  MI_InteriorFloor:      "#c8c0b0",
  MI_Asphalt:            "#6a6560",
};

function appliquerPalette(scene: THREE.Object3D) {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      const couleur = PALETTE[mat.name];
      if (couleur) {
        mat.color.set(couleur);
        mat.map = null;
        mat.roughness = mat.name.includes("Glass") ? 0.1 : 0.75;
        mat.metalness = mat.name.includes("Glass") ? 0.3 : 0.05;
        mat.needsUpdate = true;
      }
    });
  });
}

const COULEUR_STATUT: Record<StatutZone, string> = {
  ok:      "#4ade80",
  alerte:  "#fbbf24",
  rupture: "#f87171",
  info:    "#60a5fa",
  inactif: "#94a3b8",
};

// Positions calibrées pour des modèles à l'échelle 1 :
// Large  : emprise X[-9,+11] Y[0,28] Z[-16,0]
// Medium : emprise X[-7.5,+7.5] Y[0,25] Z[-12.5,+0.6]
// Small  : emprise X[-7.17,+5.17] Y[0,16] Z[-12.17,+0.17]
// Tuile  : emprise X[-9,0] Z[-9,0] (pivot coin supérieur droit)
const CONFIG_ZONE: Record<IdZone, {
  model: "large" | "medium" | "small";
  pos: [number, number, number];
  rotation: number;
}> = {
  atelier:           { model: "large",  pos: [-10, 0, 10], rotation: 0 },
  production:        { model: "large",  pos: [ 11, 0, 10], rotation: 0 },
  stock_finis:       { model: "medium", pos: [ 31, 0, 10], rotation: 0 },
  approvisionnement: { model: "medium", pos: [-31, 0, 10], rotation: 0 },
  tresorerie:        { model: "small",  pos: [ -6, 0, -10], rotation: 0 },
  equipe:            { model: "small",  pos: [-20, 0, -10], rotation: 0 },
  marque:            { model: "small",  pos: [  8, 0, -10], rotation: 0 },
};

const MODEL_PATH: Record<"large" | "medium" | "small", string> = {
  large:  "/models/Building_Large_2.gltf",
  medium: "/models/Building_Medium_2_001.gltf",
  small:  "/models/Building_Small_1.gltf",
};

const RING_RADIUS: Record<"large" | "medium" | "small", [number, number]> = {
  large:  [11, 13.5],
  medium: [9,  11.5],
  small:  [7.5, 9.5],
};

function ModeleGLTF({ path }: { path: string }) {
  const { scene } = useGLTF(path);
  const clone = useRef<THREE.Object3D | null>(null);

  if (!clone.current) {
    clone.current = scene.clone(true);
    appliquerPalette(clone.current);
  }

  return <primitive object={clone.current} />;
}

function Batiment({ zone, selectionne, onSelect }: {
  zone: ZoneVue3D;
  selectionne: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const [survol, setSurvol] = useState(false);
  const cfg = CONFIG_ZONE[zone.id];
  const couleur = COULEUR_STATUT[zone.statut];
  const [innerR, outerR] = RING_RADIUS[cfg.model];

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const cible = selectionne ? 2 : survol ? 0.6 : 0;
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y, cible, delta * 6,
    );
  });

  return (
    <group
      ref={groupRef}
      position={cfg.pos}
      rotation={[0, cfg.rotation, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setSurvol(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setSurvol(false); document.body.style.cursor = "auto"; }}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); }}
    >
      <ModeleGLTF path={MODEL_PATH[cfg.model]} />

      {/* Anneau au sol */}
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 48]} />
        <meshStandardMaterial
          color={couleur} transparent
          opacity={selectionne ? 0.9 : survol ? 0.5 : 0.3}
          side={THREE.DoubleSide}
          emissive={couleur}
          emissiveIntensity={selectionne ? 1.5 : 0.5}
        />
      </mesh>

      {/* Label */}
      <Html position={[0, 32, 0]} center distanceFactor={60} style={{ pointerEvents: "none", userSelect: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "rgba(255,255,255,0.96)", backdropFilter: "blur(10px)",
            borderRadius: "20px", padding: "4px 12px 4px 8px",
            boxShadow: `0 2px 10px rgba(0,0,0,0.15), 0 0 0 1.5px ${selectionne ? couleur : "rgba(0,0,0,0.07)"}`,
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: couleur, flexShrink: 0 }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#111", fontFamily: "system-ui", whiteSpace: "nowrap" }}>
              {zone.libelle}
            </span>
          </div>
          <div style={{
            fontSize: "10px", color: "#555", background: "rgba(255,255,255,0.88)",
            borderRadius: "10px", padding: "2px 8px", whiteSpace: "nowrap", fontFamily: "system-ui",
          }}>
            {zone.chiffre}
          </div>
        </div>
      </Html>
    </group>
  );
}

function Sol() {
  const { scene } = useGLTF("/models/Street_Asphalt_9x9.gltf");
  // Chaque tuile fait 9×9 unités, pivot au coin (x, z), s'étend vers (-x-9, z-9)
  const positions: [number, number][] = [];
  for (const x of [-36, -27, -18, -9, 0, 9, 18, 27, 36, 45]) {
    for (const z of [-16, -7, 2, 11]) {
      positions.push([x, z]);
    }
  }
  return (
    <>
      {positions.map(([x, z], i) => {
        const clone = scene.clone(true);
        appliquerPalette(clone);
        return <primitive key={i} object={clone} position={[x, 0, z]} />;
      })}
    </>
  );
}

export function Scene3D({ zones, zoneSelectionnee, onSelectZone }: {
  zones: ZoneVue3D[];
  zoneSelectionnee: IdZone | null;
  onSelectZone: (id: IdZone | null) => void;
}) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 55, 50], fov: 45 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, antialias: true }}
      onClick={() => onSelectZone(null)}
    >
      <Sky sunPosition={[1, 0.4, -0.3]} turbidity={5} rayleigh={0.4} />

      <ambientLight intensity={0.65} color="#fff4e8" />
      <directionalLight
        position={[10, 18, 8]} intensity={1.8} castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={120}
        shadow-camera-left={-55} shadow-camera-right={55}
        shadow-camera-top={30} shadow-camera-bottom={-30}
        shadow-bias={-0.0003} color="#ffe8c0"
      />
      <directionalLight position={[-6, 8, -5]} intensity={0.4} color="#c0d0e8" />

      <Suspense fallback={null}>
        <Sol />
        {zones.map((zone) => (
          <Batiment
            key={zone.id} zone={zone}
            selectionne={zoneSelectionnee === zone.id}
            onSelect={() => onSelectZone(zoneSelectionnee === zone.id ? null : zone.id)}
          />
        ))}
      </Suspense>

      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 7} maxPolarAngle={Math.PI / 2.5}
        minDistance={25} maxDistance={140}
        target={[0, 5, 0]} makeDefault
      />
    </Canvas>
  );
}
