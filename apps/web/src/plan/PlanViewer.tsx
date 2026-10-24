import type { Equipment, PlanPosition } from '@obsio/shared';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef, useState } from 'react';
import { Image as KonvaImage, Label, Layer, Stage, Tag, Text } from 'react-konva';
import {
  fitView,
  fromImage,
  MAX_ZOOM,
  toImage,
  toPlan,
  zoomAt,
  type Point,
  type Size,
  type View,
} from './geometry.js';

// Les repères doivent rester saisissables pendant un pincement à deux doigts.
Konva.hitOnDragEnabled = true;

const PLATE_FONT = '"Barlow Semi Condensed", "Arial Narrow", sans-serif';
const INK = '#18222c';
const PAPER = '#ffffff';
const SAFETY = '#f0c419';
const WHEEL_STEP = 1.15;

export interface PlanViewerHandle {
  fit: () => void;
}

interface PlanViewerProps {
  imageUrl: string;
  plan: Size;
  equipment: Equipment[];
  selectedId: string | null;
  /** Position du nouvel équipement en cours de saisie, affichée en attendant l'enregistrement. */
  draft: PlanPosition | null;
  /** L'admin peut déplacer les repères. */
  editable: boolean;
  /** Mode « placer » : un clic sur le plan renvoie la position visée. */
  placing: boolean;
  onSelect: (id: string | null) => void;
  onPlace: (position: PlanPosition) => void;
  onMove: (id: string, position: PlanPosition) => void;
  /** Reçoit la commande « tout afficher » pour la barre d'outils. */
  handleRef?: (handle: PlanViewerHandle) => void;
}

function useContainerSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Image du plan ; l'ancienne reste affichée tant que la nouvelle (lien re-signé) charge. */
function usePlanImage(url: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = new window.Image();
    element.onload = () => {
      setImage(element);
      setFailed(false);
    };
    element.onerror = () => setFailed(true);
    element.src = url;
    return () => {
      element.onload = null;
      element.onerror = null;
    };
  }, [url]);
  return { image, failed };
}

/** Les plaques sont mesurées par Konva : on attend la police pour éviter des largeurs fausses. */
function usePlateFont() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void document.fonts
      .load(`700 14px ${PLATE_FONT}`)
      .catch(() => undefined)
      .then(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);
  return ready;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function PlanViewer({
  imageUrl,
  plan,
  equipment,
  selectedId,
  draft,
  editable,
  placing,
  onSelect,
  onPlace,
  onMove,
  handleRef,
}: PlanViewerProps) {
  const [containerRef, size] = useContainerSize();
  const { image, failed } = usePlanImage(imageUrl);
  const fontReady = usePlateFont();
  const [view, setView] = useState<View | null>(null);
  // Tant que l'utilisateur n'a ni zoomé ni déplacé, la vue suit la taille de la fenêtre.
  const moved = useRef(false);
  const pinch = useRef<{ distance: number; center: Point } | null>(null);

  useEffect(() => {
    if (size && (!view || !moved.current)) setView(fitView(plan, size));
    // La vue n'est recalculée que sur changement de taille ou de plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, plan.width, plan.height]);

  useEffect(() => {
    handleRef?.({
      fit: () => {
        if (!size) return;
        moved.current = false;
        setView(fitView(plan, size));
      },
    });
  }, [handleRef, size, plan]);

  const limits = size
    ? { min: fitView(plan, size).scale / 2, max: fitView(plan, size).scale * MAX_ZOOM }
    : { min: 0.01, max: 1 };

  function zoom(anchor: Point, factor: number) {
    moved.current = true;
    setView((current) => current && zoomAt(current, anchor, factor, limits));
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    zoom(pointer, event.evt.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
  }

  function handleTouchMove(event: KonvaEventObject<TouchEvent>) {
    const touches = event.evt.touches;
    if (touches.length !== 2) return;
    event.evt.preventDefault();
    const stage = event.target.getStage()!;
    if (stage.isDragging()) stage.stopDrag();
    const box = stage.container().getBoundingClientRect();
    const a = { x: touches[0]!.clientX - box.left, y: touches[0]!.clientY - box.top };
    const b = { x: touches[1]!.clientX - box.left, y: touches[1]!.clientY - box.top };
    const current = {
      distance: distance(a, b),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
    const previous = pinch.current;
    pinch.current = current;
    if (!previous) return;
    moved.current = true;
    setView((v) => {
      if (!v) return v;
      const zoomed = zoomAt(v, current.center, current.distance / previous.distance, limits);
      // Le déplacement du centre du pincement entraîne aussi le plan.
      return {
        ...zoomed,
        x: zoomed.x + current.center.x - previous.center.x,
        y: zoomed.y + current.center.y - previous.center.y,
      };
    });
  }

  function handleStageClick(event: KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = event.target.getStage();
    const onBackground = event.target === stage || event.target.name() === 'plan';
    if (!stage || !view || !onBackground) return;
    if (!placing) {
      onSelect(null);
      return;
    }
    const pointer = stage.getPointerPosition();
    const position = pointer && toPlan(view, pointer, plan);
    if (position) onPlace(position);
  }

  const placed = equipment.filter((item) => item.position);

  return (
    <div
      ref={containerRef}
      className={placing ? 'plan-canvas placing' : 'plan-canvas'}
      aria-label="Plan de l'étage"
      role="img"
    >
      {failed && !image && (
        <p className="plan-message error">Le plan n’a pas pu être chargé. Rechargez la page.</p>
      )}
      {!failed && !image && <p className="plan-message">Chargement du plan…</p>}
      {size && view && image && (
        <Stage
          width={size.width}
          height={size.height}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable
          onDragStart={(event) => {
            if (event.target === event.target.getStage()) moved.current = true;
          }}
          onDragEnd={(event) => {
            const stage = event.target.getStage();
            if (event.target === stage) {
              setView((v) => v && { ...v, x: stage.x(), y: stage.y() });
            }
          }}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => {
            pinch.current = null;
          }}
          onClick={handleStageClick}
          onTap={handleStageClick}
        >
          <Layer>
            <KonvaImage image={image} width={plan.width} height={plan.height} name="plan" />
          </Layer>
          {fontReady && (
            <Layer>
              {placed.map((item) => (
                <Plate
                  key={item.id}
                  text={item.name}
                  at={toImage(item.position!, plan)}
                  scale={1 / view.scale}
                  selected={item.id === selectedId}
                  draggable={editable && !placing}
                  onSelect={() => onSelect(item.id)}
                  onDragEnd={(point) => onMove(item.id, fromImage(point, plan))}
                />
              ))}
              {draft && (
                <Plate text="Nouveau" at={toImage(draft, plan)} scale={1 / view.scale} selected />
              )}
            </Layer>
          )}
        </Stage>
      )}
    </div>
  );
}

/**
 * Repère d'équipement dessiné comme une plaque gravée de tableau électrique : texte clair sur
 * fond sombre, pointe vers l'emplacement exact. Taille constante à l'écran quel que soit le zoom.
 */
function Plate({
  text,
  at,
  scale,
  selected,
  draggable = false,
  onSelect,
  onDragEnd,
}: {
  text: string;
  at: Point;
  scale: number;
  selected: boolean;
  draggable?: boolean;
  onSelect?: () => void;
  onDragEnd?: (point: Point) => void;
}) {
  return (
    <Label
      x={at.x}
      y={at.y}
      scaleX={scale}
      scaleY={scale}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onSelect}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDragEnd?.({ x: event.target.x(), y: event.target.y() });
      }}
      onMouseEnter={(event) => {
        const container = event.target.getStage()?.container();
        if (container) container.style.cursor = draggable ? 'grab' : 'pointer';
      }}
      onMouseLeave={(event) => {
        const container = event.target.getStage()?.container();
        if (container) container.style.cursor = '';
      }}
    >
      <Tag
        fill={selected ? SAFETY : INK}
        stroke={selected ? INK : PAPER}
        strokeWidth={1}
        cornerRadius={2}
        pointerDirection="down"
        pointerWidth={10}
        pointerHeight={7}
        shadowColor={INK}
        shadowOpacity={0.25}
        shadowBlur={3}
        shadowOffsetY={1}
      />
      <Text
        text={text}
        fontFamily={PLATE_FONT}
        fontStyle="700"
        fontSize={14}
        letterSpacing={0.4}
        padding={5}
        fill={selected ? INK : PAPER}
      />
    </Label>
  );
}
