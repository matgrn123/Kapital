"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF } from "@react-three/drei";
import { echelleDansEmprise } from "./ajustement";
import * as THREE from "three";

export type ModulePose = {
  id: string;
  module_type_id: string;
  x: number;
  y: number;
  pivote: boolean;
};

export type InfoModule = {
  id: string;
  nom: string;
  largeur_grille: number;
  hauteur_grille: number;
  effet_type: string;
};

type Props = {
  largeur: number;
  hauteur: number;
  entree_x: number;
  entree_y: number;
  modules: ModulePose[];
  catalogue: InfoModule[];
};

// Couleur de fond par type d'effet
const COULEUR_EFFET: Record<string, string> = {
  poste_artisan:            "#4a7cb8",
  poste_artisan_specialise: "#7a60b8",
  table_coupe:              "#4a9870",
  stockage:                 "#6a9850",
  bureau:                   "#c87840",
  salle_reunion:            "#c86040",
  showroom:                 "#c05080",
  pause:                    "#c0a040",
  aucun:                    "#888888",
};

// ---------------------------------------------------------------------------
// Grille de sol
// ---------------------------------------------------------------------------

function GrilleSol({ largeur, hauteur }: { largeur: number; hauteur: number }) {
  const points: THREE.Vector3[] = [];

  for (let x = 0; x <= largeur; x++) {
    points.push(new THREE.Vector3(x, 0, 0));
    points.push(new THREE.Vector3(x, 0, hauteur));
  }
  for (let z = 0; z <= hauteur; z++) {
    points.push(new THREE.Vector3(0, 0, z));
    points.push(new THREE.Vector3(largeur, 0, z));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#b8b0a4" />
    </lineSegments>
  );
}

// ---------------------------------------------------------------------------
// Murs périmétraux
// ---------------------------------------------------------------------------

function Murs({ largeur, hauteur, entree_x, entree_y }: { largeur: number; hauteur: number; entree_x: number; entree_y: number }) {
  const H = 2.5;
  const E = 0.15; // épaisseur

  const segments: { pos: [number, number, number]; taille: [number, number, number] }[] = [];

  if (entree_x === 0) {
    // Entrée sur le mur ouest — deux segments verticaux autour de l'ouverture
    const ouv = entree_y - 1; // cellule y de l'ouverture (0-indexed)
    if (ouv > 0) {
      segments.push({
        pos: [-E / 2, H / 2, ouv / 2],
        taille: [E, H, ouv],
      });
    }
    if (ouv < hauteur - 1) {
      const reste = hauteur - ouv - 1;
      segments.push({
        pos: [-E / 2, H / 2, ouv + 1 + reste / 2],
        taille: [E, H, reste],
      });
    }
  } else {
    segments.push({ pos: [-E / 2, H / 2, hauteur / 2], taille: [E, H, hauteur] });
  }

  // Mur est
  segments.push({ pos: [largeur + E / 2, H / 2, hauteur / 2], taille: [E, H, hauteur] });
  // Mur nord
  segments.push({ pos: [largeur / 2, H / 2, -E / 2], taille: [largeur, H, E] });
  // Mur sud
  segments.push({ pos: [largeur / 2, H / 2, hauteur + E / 2], taille: [largeur, H, E] });

  return (
    <>
      {segments.map((s, i) => (
        <mesh key={i} position={s.pos} castShadow receiveShadow>
          <boxGeometry args={s.taille} />
          <meshLambertMaterial color="#d8d0c4" />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Marqueur d'entrée
// ---------------------------------------------------------------------------

function MarqueurEntree({ x, y }: { x: number; y: number }) {
  const cx = x === 0 ? -0.3 : x + 0.3;
  const cz = y - 0.5;
  return (
    <mesh position={[cx, 0.05, cz]}>
      <boxGeometry args={[0.6, 0.1, 1]} />
      <meshLambertMaterial color="#4CAF50" />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Module posé : meuble 3D (Kenney Furniture Pack, CC0) sur un tapis coloré
// ---------------------------------------------------------------------------

// Meuble affiché pour chaque type d'effet (fichiers dans public/models/atelier,
// tous inscrits dans assets/LICENCES.md).
const MEUBLE_EFFET: Record<string, string> = {
  poste_artisan:            "/models/atelier/tableCross.glb",
  poste_artisan_specialise: "/models/atelier/deskCorner.glb",
  table_coupe:              "/models/atelier/tableCloth.glb",
  stockage:                 "/models/atelier/bookcaseOpen.glb",
  bureau:                   "/models/atelier/desk.glb",
  salle_reunion:            "/models/atelier/tableRound.glb",
  showroom:                 "/models/atelier/coatRackStanding.glb",
  pause:                    "/models/atelier/loungeSofa.glb",
};
Object.values(MEUBLE_EFFET).forEach((u) => useGLTF.preload(u));

type PropsBoite = {
  x: number;
  y: number;
  w: number;
  d: number;
  nom: string;
  couleur: string;
  modele?: string;
  pivote: boolean;
};

/** Meuble recentré sur son emprise et mis à l'échelle (la géométrie est partagée entre copies). */
function Meuble({ url, w, d, pivote }: { url: string; w: number; d: number; pivote: boolean }) {
  const { scene } = useGLTF(url);
  const objet = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    if (pivote) c.rotation.y = Math.PI / 2;
    const boite = new THREE.Box3().setFromObject(c);
    const t = boite.getSize(new THREE.Vector3());
    const e = echelleDansEmprise([t.x, t.y, t.z], w, d);
    const centre = boite.getCenter(new THREE.Vector3());
    const g = new THREE.Group();
    c.position.set(-centre.x, -boite.min.y, -centre.z);
    g.add(c);
    g.scale.setScalar(e);
    return g;
  }, [scene, w, d, pivote]);
  return <primitive object={objet} />;
}

function BoiteModule({ x, y, w, d, nom, couleur, modele, pivote }: PropsBoite) {
  const [survol, setSurvol] = useState(false);
  const groupe = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupe.current) return;
    const cible = survol ? 0.25 : 0;
    groupe.current.position.y += (cible - groupe.current.position.y) * Math.min(1, delta * 8);
  });

  const cx = x + w / 2 - 0.5;
  const cz = y + d / 2 - 0.5;

  function onPointerEnter(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    setSurvol(true);
    document.body.style.cursor = "pointer";
  }

  function onPointerLeave() {
    setSurvol(false);
    document.body.style.cursor = "";
  }

  return (
    <group position={[cx, 0, cz]} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      {/* tapis de la couleur du type de module : repère l'emprise au sol */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w - 0.1, d - 0.1]} />
        <meshStandardMaterial color={couleur} transparent opacity={survol ? 0.6 : 0.35} />
      </mesh>
      <group ref={groupe}>
        {modele ? (
          <Suspense fallback={null}>
            <Meuble url={modele} w={w} d={d} pivote={pivote} />
          </Suspense>
        ) : (
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[w - 0.2, 1.2, d - 0.2]} />
            <meshStandardMaterial color={couleur} />
          </mesh>
        )}
      </group>
      {survol && (
        <Html position={[0, 2.6, 0]} center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink shadow-sm ring-1 ring-line">
            {nom}
          </div>
        </Html>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Contenu 3D de la scène
// ---------------------------------------------------------------------------

function ContenuScene({ largeur, hauteur, entree_x, entree_y, modules, catalogue }: Props) {
  const catMap = new Map(catalogue.map((c) => [c.id, c]));

  return (
    <>
      <hemisphereLight args={["#f2f4f8", "#b8ab98", 1.2]} />
      <directionalLight
        position={[largeur * 0.8, 12, hauteur * 0.8]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-largeur} shadow-camera-right={largeur}
        shadow-camera-top={hauteur} shadow-camera-bottom={-hauteur}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-5, 8, -5]} intensity={0.3} />

      {/* Plancher */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[largeur / 2, -0.01, hauteur / 2]} receiveShadow>
        <planeGeometry args={[largeur, hauteur]} />
        <meshLambertMaterial color="#ede8e0" />
      </mesh>

      <GrilleSol largeur={largeur} hauteur={hauteur} />
      <Murs largeur={largeur} hauteur={hauteur} entree_x={entree_x} entree_y={entree_y} />
      <MarqueurEntree x={entree_x} y={entree_y} />

      {modules.map((m) => {
        const dim = catMap.get(m.module_type_id);
        if (!dim) return null;
        const w = m.pivote ? dim.hauteur_grille : dim.largeur_grille;
        const d = m.pivote ? dim.largeur_grille : dim.hauteur_grille;
        const couleur = COULEUR_EFFET[dim.effet_type] ?? "#888888";
        return (
          <BoiteModule
            key={m.id}
            x={m.x}
            y={m.y}
            w={w}
            d={d}
            nom={dim.nom}
            couleur={couleur}
            modele={MEUBLE_EFFET[dim.effet_type]}
            pivote={m.pivote}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Export : composant principal
// ---------------------------------------------------------------------------

export function SceneAtelierInterieur(props: Props) {
  const { largeur, hauteur } = props;
  const cx = largeur / 2;
  const cz = hauteur / 2;
  const dist = Math.max(largeur, hauteur) * 1.1;

  return (
    <Canvas
      camera={{
        position: [cx + dist, dist * 0.9, cz + dist],
        fov: 40,
        near: 0.1,
        far: 500,
      }}
      shadows
      onCreated={({ camera }) => camera.lookAt(cx, 0, cz)}
    >
      <ContenuScene {...props} />
      <OrbitControls
        target={[cx, 0, cz]}
        minDistance={5}
        maxDistance={dist * 2.5}
        maxPolarAngle={Math.PI / 2.1}
        enablePan
      />
    </Canvas>
  );
}
