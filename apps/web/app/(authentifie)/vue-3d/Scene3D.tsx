"use client";

import { useEffect, useRef, useState, Suspense, type ComponentRef, type RefObject } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { ZoneVue3D, IdZone, StatutZone } from "../../../lib/vue3d";
import { cadrerBoite, type Vec3 } from "./cadrage";

useGLTF.preload("/models/Building_Large_2.gltf");
useGLTF.preload("/models/Building_Medium_2_001.gltf");
useGLTF.preload("/models/Building_Small_1.gltf");

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
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      if (mat.map) {
        // On garde la texture du modèle (briques, béton, vitres...) : la
        // couleur reste blanche pour ne pas la teinter.
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = 4;
        mat.color.set("#ffffff");
      } else {
        const couleur = PALETTE[mat.name];
        if (couleur) mat.color.set(couleur);
      }
      if (mat.name.includes("Glass")) { mat.roughness = 0.15; mat.metalness = 0.3; }
      mat.needsUpdate = true;
    });
  });
}

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

const COULEUR_STATUT: Record<StatutZone, string> = {
  ok:      "#4ade80",
  alerte:  "#fbbf24",
  rupture: "#f87171",
  info:    "#60a5fa",
  inactif: "#94a3b8",
};

// Emprise des modèles à l'échelle 1 (mesurée dans les .gltf) :
// Large  : X[-9,+11]      Z[-16,0]     hauteur 28
// Medium : X[-7.5,+7.5]   Z[-12.5,0.6] hauteur 25
// Small  : X[-7.17,+5.17] Z[-12.17,0.17] hauteur 16
// Façade côté +Z. CENTRE_MODELE recentre chaque modèle sur son emprise, pour
// que `pos` désigne le centre au sol du bâtiment.
const CENTRE_MODELE: Record<"large" | "medium" | "small", [number, number]> = {
  large: [1, -8], medium: [0, -6], small: [-1, -6],
};

// Deux rangées qui se font face de part et d'autre de la rue (z = 0), comme
// le village de la maquette. Toutes les façades regardent la caméra (+Z).
const CONFIG_ZONE: Record<IdZone, {
  model: "large" | "medium" | "small";
  pos: [number, number, number];
  rotation: number;
}> = {
  approvisionnement: { model: "medium", pos: [-24,   0, -9.5],  rotation: 0 },
  atelier:           { model: "large",  pos: [-2.5,  0, -10.5], rotation: 0 },
  production:        { model: "large",  pos: [21.5,  0, -10.5], rotation: 0 },
  equipe:            { model: "small",  pos: [-25.8, 0, 8.7],  rotation: 0 },
  tresorerie:        { model: "small",  pos: [-9.4,  0, 8.7],  rotation: 0 },
  marque:            { model: "small",  pos: [6.9,   0, 8.7],  rotation: 0 },
  stock_finis:       { model: "medium", pos: [24.5,  0, 9.2],  rotation: 0 },
};

const MODEL_PATH: Record<"large" | "medium" | "small", string> = {
  large:  "/models/Building_Large_2.gltf",
  medium: "/models/Building_Medium_2_001.gltf",
  small:  "/models/Building_Small_1.gltf",
};

const HAUTEUR_ETIQUETTE: Record<"large" | "medium" | "small", number> = {
  large: 31, medium: 28, small: 19,
};

const RING_RADIUS: Record<"large" | "medium" | "small", [number, number]> = {
  large:  [11.2, 12],
  medium: [8.8, 9.6],
  small:  [7.6, 8.4],
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
      <group position={[-CENTRE_MODELE[cfg.model][0], 0, -CENTRE_MODELE[cfg.model][1]]}>
        <ModeleGLTF path={MODEL_PATH[cfg.model]} />
      </group>

      {/* Anneau au sol : discret, plus marqué au survol et à la sélection */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 48]} />
        <meshBasicMaterial
          color={couleur} transparent depthWrite={false}
          opacity={selectionne ? 0.85 : survol ? 0.5 : 0.22}
        />
      </mesh>

      {/* Étiquette : pastille blanche, en bleu accent quand le bâtiment est choisi */}
      <Html position={[0, HAUTEUR_ETIQUETTE[cfg.model], 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none", userSelect: "none" }}>
        <div className="flex flex-col items-center gap-0.5">
          <div
            className={
              "flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-sm ring-1 " +
              (selectionne
                ? "bg-accent text-on-accent ring-accent"
                : "bg-surface text-ink ring-line")
            }
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: couleur }} />
            {zone.libelle}
          </div>
          {(selectionne || survol) && (
            <div className="whitespace-nowrap rounded-full bg-surface px-2 py-px text-[10px] text-muted shadow-sm">
              {zone.chiffre}
            </div>
          )}
          <span className={"h-1.5 w-px " + (selectionne ? "bg-accent" : "bg-muted")} />
        </div>
      </Html>
    </group>
  );
}

// Emprise de la scène (bâtiments compris), pour le cadrage de la caméra
const BOITE_VILLAGE = { min: [-38, -3, -26] as Vec3, max: [38, 28, 26] as Vec3 };

/** Socle du village, comme la maquette : pelouse, rue centrale, tranche de terre. */
function Socle() {
  return (
    <group>
      {/* tranche de terre sous la pelouse */}
      <mesh position={[0, -1.6, 0]} receiveShadow>
        <boxGeometry args={[76, 3, 52]} />
        <meshStandardMaterial color="#7a5a3c" roughness={1} />
      </mesh>
      {/* pelouse */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[76, 52]} />
        <meshStandardMaterial color="#86b765" roughness={1} />
      </mesh>
      {/* rue centrale */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[76, 4.4]} />
        <meshStandardMaterial color="#5f6670" roughness={0.95} />
      </mesh>
      {/* trottoirs clairs */}
      {[-2.6, 2.6].map((z) => (
        <mesh key={z} position={[0, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[76, 0.8]} />
          <meshStandardMaterial color="#d6d0c4" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Place la caméra pour voir tout le village, et recadre si la fenêtre change. */
function CadrageAuto({ controles }: { controles: RefObject<OrbitControlsImpl | null> }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const c = cadrerBoite(BOITE_VILLAGE, persp.fov, size.width / Math.max(1, size.height));
    camera.position.set(...c.position);
    camera.lookAt(...c.cible);
    if (controles.current) {
      controles.current.target.set(...c.cible);
      controles.current.maxDistance = c.distance * 1.6;
      controles.current.update();
    }
  }, [camera, size.width, size.height, controles]);
  return null;
}

export function Scene3D({ zones, zoneSelectionnee, onSelectZone }: {
  zones: ZoneVue3D[];
  zoneSelectionnee: IdZone | null;
  onSelectZone: (id: IdZone | null) => void;
}) {
  const controles = useRef<OrbitControlsImpl | null>(null);
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [80, 80, 80], fov: 35, near: 1, far: 600 }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2, antialias: true, alpha: true }}
      onPointerMissed={() => onSelectZone(null)}
    >
      {/* Lumière du ciel (haut bleuté, bas couleur pelouse) + soleil qui porte les ombres */}
      <hemisphereLight args={["#e4eef7", "#8a9a6a", 1.5]} />
      <directionalLight
        position={[45, 70, 30]} intensity={2.2} castShadow color="#fff1dc"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={10} shadow-camera-far={200}
        shadow-camera-left={-60} shadow-camera-right={60}
        shadow-camera-top={50} shadow-camera-bottom={-50}
        shadow-bias={-0.0004} shadow-normalBias={0.04} shadow-radius={4}
      />
      <directionalLight position={[-30, 25, -20]} intensity={0.35} color="#c0d0e8" />

      <Socle />
      <Suspense fallback={null}>
        {zones.map((zone) => (
          <Batiment
            key={zone.id} zone={zone}
            selectionne={zoneSelectionnee === zone.id}
            onSelect={() => onSelectZone(zoneSelectionnee === zone.id ? null : zone.id)}
          />
        ))}
      </Suspense>
      {/* ombre de contact douce au pied des bâtiments, calculée une seule fois */}
      <ContactShadows position={[0, 0.02, 0]} scale={[76, 52]} far={20} blur={2.5} opacity={0.35} frames={1} resolution={512} />

      <CadrageAuto controles={controles} />
      <OrbitControls
        ref={controles}
        enablePan={false}
        minPolarAngle={Math.PI / 8} maxPolarAngle={Math.PI / 2.6}
        minDistance={40}
        makeDefault
      />
    </Canvas>
  );
}
