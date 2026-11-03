import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ReserveBadge } from '../plan/PlanViewer.js';

// Vue 3D d'un bâtiment par empilement des plans : chaque étage est une plaque à la hauteur de
// son niveau, texturée par l'image de son plan, avec les équipements en repères verticaux.
// Faute de murs dans un plan PDF ou image, on n'extrude pas de cloisons (spec, « Hors MVP »).

export interface SceneFloor {
  id: string;
  name: string;
  level: number;
  /** `scale` : mètres par pixel de l'image, si l'échelle de l'étage est calibrée. */
  plan: { imageUrl: string; width: number; height: number; scale: number | null } | null;
  equipment: { id: string; name: string; position: { x: number; y: number } }[];
}

/** Largeur commune des plans, en mètres, tant que l'échelle des étages n'est pas calibrée. */
const PLAN_WIDTH = 40;
const STOREY_HEIGHT = 4;

export interface SceneColors {
  ink: string;
  muted: string;
  surface: string;
  ouverte: string;
  assignee: string;
  corrigee: string;
  selection: string;
}

/** Couleurs de la charte lues dans les variables CSS, pour rester en accord avec le plan 2D. */
export function readSceneColors(): SceneColors {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    ink: v('--ink'),
    muted: v('--muted'),
    surface: v('--surface'),
    ouverte: v('--danger'),
    assignee: v('--cobalt'),
    corrigee: v('--pending'),
    selection: v('--copper'),
  };
}

/**
 * Dimensions au sol de chaque étage, dans les proportions de l'image de son plan : en vrais
 * mètres si tous les plans sont calibrés, sinon à une largeur commune (des échelles mêlées
 * donneraient des étages incomparables).
 */
export function footprints(floors: SceneFloor[]) {
  const plans = floors.flatMap((f) => (f.plan ? [f.plan] : []));
  const calibrated = plans.length > 0 && plans.every((plan) => plan.scale);
  const widest = calibrated ? Math.max(...plans.map((p) => p.width * p.scale!)) : PLAN_WIDTH;
  return new Map(
    floors.map((f) => {
      if (!f.plan) return [f.id, { width: widest, depth: widest * 0.6 }];
      const width = calibrated ? f.plan.width * f.plan.scale! : PLAN_WIDTH;
      return [f.id, { width, depth: (width * f.plan.height) / f.plan.width }];
    }),
  );
}

export function BuildingScene({
  floors,
  badges,
  colors,
  spread,
  focusedFloorId,
  selectedId,
  onSelect,
}: {
  floors: SceneFloor[];
  badges: Map<string, ReserveBadge>;
  colors: SceneColors;
  /** Écartement vertical des étages (1 = hauteur d'étage). */
  spread: number;
  focusedFloorId: string | null;
  selectedId: string | null;
  onSelect: (equipmentId: string | null) => void;
}) {
  const sizes = useMemo(() => footprints(floors), [floors]);
  const span = Math.max(...[...sizes.values()].map((s) => Math.max(s.width, s.depth)), 10);
  // Repères à la même taille apparente, que le bâtiment fasse 15 ou 150 m.
  const markerSize = Math.max(...[...sizes.values()].map((s) => s.width)) / PLAN_WIDTH;
  const levels = floors.map((f) => f.level);
  const middle = ((Math.min(...levels) + Math.max(...levels)) / 2) * STOREY_HEIGHT * spread;

  return (
    <Canvas
      className="plan-canvas"
      camera={{ position: [span * 0.7, middle + span * 0.75, span * 0.9], fov: 40, near: 0.1 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={[colors.surface]} />
      <ambientLight intensity={2.2} />
      <directionalLight position={[20, 40, 30]} intensity={1.2} />
      <Controls target={[0, middle, 0]} />
      {floors.map((floor) => (
        <FloorSlab
          key={floor.id}
          floor={floor}
          size={sizes.get(floor.id)!}
          y={floor.level * STOREY_HEIGHT * spread}
          dimmed={focusedFloorId !== null && focusedFloorId !== floor.id}
          markerSize={markerSize}
          badges={badges}
          colors={colors}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </Canvas>
  );
}

function Controls({ target }: { target: [number, number, number] }) {
  const { camera, gl } = useThree();
  const [x, y, z] = target;
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(x, y, z);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();
    let frame = requestAnimationFrame(function loop() {
      controls.update();
      frame = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(frame);
      controls.dispose();
    };
  }, [camera, gl, x, y, z]);
  return null;
}

/** Texture du plan ; null tant qu'elle charge ou si le stockage la refuse. */
function usePlanTexture(url: string | undefined) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(
      url,
      (result) => {
        result.colorSpace = THREE.SRGBColorSpace;
        result.anisotropy = 8;
        loaded = result;
        if (alive) setTexture(result);
        else result.dispose();
      },
      undefined,
      () => alive && setTexture(null),
    );
    return () => {
      alive = false;
      loaded?.dispose();
      setTexture(null);
    };
  }, [url]);
  return texture;
}

function FloorSlab({
  floor,
  size,
  y,
  dimmed,
  markerSize,
  badges,
  colors,
  selectedId,
  onSelect,
}: {
  floor: SceneFloor;
  size: { width: number; depth: number };
  y: number;
  dimmed: boolean;
  markerSize: number;
  badges: Map<string, ReserveBadge>;
  colors: SceneColors;
  selectedId: string | null;
  onSelect: (equipmentId: string | null) => void;
}) {
  const texture = usePlanTexture(floor.plan?.imageUrl);
  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(size.width, 0.2, size.depth)),
    [size.width, size.depth],
  );
  const opacity = dimmed ? 0.18 : 1;

  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size.width, size.depth]} />
        <meshBasicMaterial
          map={texture}
          color={texture ? '#ffffff' : colors.surface}
          side={THREE.DoubleSide}
          transparent
          opacity={opacity}
          depthWrite={!dimmed}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={colors.ink} transparent opacity={dimmed ? 0.2 : 0.9} />
      </lineSegments>
      {!dimmed &&
        floor.equipment.map((item) => (
          <Marker
            key={item.id}
            position={[
              (item.position.x - 0.5) * size.width,
              0,
              (item.position.y - 0.5) * size.depth,
            ]}
            size={markerSize}
            badge={badges.get(item.id)}
            colors={colors}
            selected={item.id === selectedId}
            onSelect={(event) => {
              event.stopPropagation();
              onSelect(item.id);
            }}
          />
        ))}
    </group>
  );
}

function Marker({
  position,
  size,
  badge,
  colors,
  selected,
  onSelect,
}: {
  position: [number, number, number];
  size: number;
  badge: ReserveBadge | undefined;
  colors: SceneColors;
  selected: boolean;
  onSelect: (event: ThreeEvent<MouseEvent>) => void;
}) {
  // Plus de réserves, repère plus haut : les points chauds ressortent de loin.
  const height = badge ? 2.5 + Math.min(badge.count, 8) * 0.7 : 1.6;
  const color = badge ? colors[badge.status] : colors.muted;
  const [hovered, setHovered] = useState(false);
  const radius = badge ? 0.9 : 0.55;
  return (
    <group
      position={position}
      scale={size}
      onClick={onSelect}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = '';
      }}
    >
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, height, 8]} />
        <meshStandardMaterial color={colors.ink} />
      </mesh>
      <mesh position={[0, height, 0]} scale={hovered || selected ? 1.35 : 1}>
        <sphereGeometry args={[radius, 20, 14]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? colors.selection : '#000000'}
          emissiveIntensity={selected ? 0.6 : 0}
        />
      </mesh>
      {badge?.overdue && (
        <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius + 0.45, 0.15, 8, 32]} />
          <meshStandardMaterial color={colors.ouverte} />
        </mesh>
      )}
    </group>
  );
}
