import type { Equipment, PlanBounds, PlanPosition, Zone } from '@obsio/shared';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Group,
  Image as KonvaImage,
  Label,
  Layer,
  Line,
  Rect,
  Stage,
  Tag,
  Text,
} from 'react-konva';
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
import { scaleBar } from './scale.js';

// Les repères doivent rester saisissables pendant un pincement à deux doigts.
Konva.hitOnDragEnabled = true;

const PLATE_FONT = '"Barlow Semi Condensed", "Arial Narrow", sans-serif';
const INK = '#0e2a28';
const PAPER = '#ffffff';
const COPPER = '#b5541f';
const WHEEL_STEP = 1.15;
const PLATE_FONT_SIZE = 14;
const PLATE_PADDING = 5;
const PLATE_SPACING = 0.4;
const POINTER_HEIGHT = 7;

/** Pastille des réserves d'un équipement : nombre en cours, couleur du statut le plus urgent. */
export interface ReserveBadge {
  count: number;
  status: 'ouverte' | 'assignee' | 'corrigee';
  overdue: boolean;
}

export const BADGE_COLORS: Record<ReserveBadge['status'], string> = {
  ouverte: '#b0203f',
  assignee: '#2c4f86',
  corrigee: '#8a5600',
};

let measureContext: CanvasRenderingContext2D | null = null;

/** Largeur d'une plaque, calculée comme Konva le fait, pour accrocher la pastille au coin. */
function plateWidth(text: string) {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return 40;
  measureContext.font = `700 ${PLATE_FONT_SIZE}px ${PLATE_FONT}`;
  const width = measureContext.measureText(text).width + PLATE_SPACING * text.length;
  return width + PLATE_PADDING * 2;
}

export interface PlanViewerHandle {
  fit: () => void;
  /** Centre la vue sur une position, en zoomant assez pour lire les repères voisins. */
  focus: (position: PlanPosition) => void;
  /** Cadre la vue sur un rectangle du plan (une zone). */
  show: (bounds: PlanBounds) => void;
}

/** Marge autour d'une zone cadrée, en pixels d'écran. */
const SHOW_MARGIN = 48;
const ZONE_INK = 'rgba(14, 42, 40, 0.5)';
const ZONE_FILL = 'rgba(14, 42, 40, 0.035)';
const ZONE_ACTIVE_FILL = 'rgba(181, 84, 31, 0.07)';

/** Zoom minimal, par rapport à la vue d'ensemble, quand on centre sur un équipement. */
const FOCUS_ZOOM = 2.5;
/** Repère écarté par la recherche ou les filtres : visible mais en retrait. */
const DIMMED_OPACITY = 0.28;

interface PlanViewerProps {
  imageUrl: string;
  plan: Size;
  equipment: Equipment[];
  /** Réserves en cours par équipement. */
  badges?: Map<string, ReserveBadge>;
  /** Équipements retenus par la recherche ou les filtres ; null : tous en évidence. */
  matching?: Set<string> | null;
  /** Zones de l'étage, dessinées sous les repères ; la zone choisie est soulignée. */
  zones?: Zone[];
  activeZoneId?: string | null;
  /** Toucher le nom d'une zone la choisit. */
  onZoneSelect?: (id: string) => void;
  /** Zone en cours de tracé : un ou deux coins, en pixels de l'image. */
  zoneDraft?: Point[];
  selectedId: string | null;
  /** Position du nouvel équipement en cours de saisie, affichée en attendant l'enregistrement. */
  draft: PlanPosition | null;
  /** L'admin peut déplacer les repères. */
  editable: boolean;
  /** Mode « placer » : un clic sur le plan renvoie la position visée. */
  placing: boolean;
  /** Mode « mesurer » (ou calibrer) : un clic renvoie le point visé, en pixels de l'image. */
  measuring?: boolean;
  /** Segment en cours de tracé, en pixels de l'image, et sa cote à afficher. */
  segment?: { points: Point[]; label: string | null };
  onMeasurePoint?: (point: Point) => void;
  /** Mètres par pixel de l'image : affiche une barre d'échelle. */
  metersPerPixel?: number | null;
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
  badges,
  matching = null,
  zones = [],
  activeZoneId = null,
  onZoneSelect,
  zoneDraft,
  selectedId,
  draft,
  editable,
  placing,
  measuring = false,
  segment,
  onMeasurePoint,
  metersPerPixel,
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

  const limits = size
    ? { min: fitView(plan, size).scale / 2, max: fitView(plan, size).scale * MAX_ZOOM }
    : { min: 0.01, max: 1 };

  function fit() {
    if (!size) return;
    moved.current = false;
    setView(fitView(plan, size));
  }

  useEffect(() => {
    handleRef?.({
      fit,
      focus: (position) => {
        if (!size) return;
        moved.current = true;
        setView((current) => {
          const base = fitView(plan, size).scale;
          const scale = Math.max(current?.scale ?? base, base * FOCUS_ZOOM);
          const point = toImage(position, plan);
          return {
            scale,
            x: size.width / 2 - point.x * scale,
            y: size.height / 2 - point.y * scale,
          };
        });
      },
      show: (bounds) => {
        if (!size) return;
        moved.current = true;
        const width = bounds.width * plan.width;
        const height = bounds.height * plan.height;
        const base = fitView(plan, size).scale;
        const scale = Math.min(
          base * MAX_ZOOM,
          Math.max(
            base,
            Math.min(
              (size.width - 2 * SHOW_MARGIN) / width,
              (size.height - 2 * SHOW_MARGIN) / height,
            ),
          ),
        );
        const center = {
          x: (bounds.x + bounds.width / 2) * plan.width,
          y: (bounds.y + bounds.height / 2) * plan.height,
        };
        setView({
          scale,
          x: size.width / 2 - center.x * scale,
          y: size.height / 2 - center.y * scale,
        });
      },
    });
    // fit ne dépend que de size et plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleRef, size, plan]);

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
    if (!stage || !view) return;
    if (measuring) {
      const pointer = stage.getPointerPosition();
      const position = pointer && toPlan(view, pointer, plan);
      if (position) onMeasurePoint?.(toImage(position, plan));
      return;
    }
    if (!onBackground) return;
    if (!placing) {
      onSelect(null);
      return;
    }
    const pointer = stage.getPointerPosition();
    const position = pointer && toPlan(view, pointer, plan);
    if (position) onPlace(position);
  }

  // Les repères en évidence passent devant les autres.
  const placed = equipment
    .filter((item) => item.position)
    .sort((a, b) => Number(isShown(a.id)) - Number(isShown(b.id)));

  function isShown(id: string) {
    return !matching || matching.has(id) || id === selectedId;
  }

  return (
    <div
      ref={containerRef}
      className={placing || measuring ? 'plan-canvas placing' : 'plan-canvas'}
      aria-label="Plan de l'étage"
      role="region"
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
          {fontReady && zones.length > 0 && (
            <Layer>
              {zones.map((zone) => (
                <ZoneShape
                  key={zone.id}
                  zone={zone}
                  plan={plan}
                  scale={1 / view.scale}
                  active={zone.id === activeZoneId}
                  onSelect={
                    onZoneSelect && !placing && !measuring ? () => onZoneSelect(zone.id) : undefined
                  }
                />
              ))}
            </Layer>
          )}
          {fontReady && (
            <Layer>
              {placed.map((item) => (
                <Plate
                  key={item.id}
                  text={item.name}
                  badge={badges?.get(item.id)}
                  at={toImage(item.position!, plan)}
                  scale={1 / view.scale}
                  selected={item.id === selectedId}
                  dimmed={!isShown(item.id)}
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
          {zoneDraft && zoneDraft.length > 0 && (
            <Layer listening={false}>
              <ZoneDraft points={zoneDraft} scale={1 / view.scale} />
            </Layer>
          )}
          {segment && segment.points.length > 0 && (
            <Layer listening={false}>
              <Segment points={segment.points} label={segment.label} scale={1 / view.scale} />
            </Layer>
          )}
        </Stage>
      )}
      {view && metersPerPixel && <ScaleBar screenPixelsPerMeter={view.scale / metersPerPixel} />}
      {view && image && (
        <div className="plan-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoomer"
            title="Zoomer"
            onClick={() => size && zoom({ x: size.width / 2, y: size.height / 2 }, WHEEL_STEP ** 3)}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Dézoomer"
            title="Dézoomer"
            onClick={() =>
              size && zoom({ x: size.width / 2, y: size.height / 2 }, 1 / WHEEL_STEP ** 3)
            }
          >
            <Minus size={16} strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" aria-label="Tout afficher" title="Tout afficher" onClick={fit}>
            <Maximize size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
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
  badge,
  at,
  scale,
  selected,
  dimmed = false,
  draggable = false,
  onSelect,
  onDragEnd,
}: {
  text: string;
  badge?: ReserveBadge;
  at: Point;
  scale: number;
  selected: boolean;
  dimmed?: boolean;
  draggable?: boolean;
  onSelect?: () => void;
  onDragEnd?: (point: Point) => void;
}) {
  const plateHeight = PLATE_FONT_SIZE + PLATE_PADDING * 2;
  return (
    <Group
      x={at.x}
      y={at.y}
      scaleX={scale}
      scaleY={scale}
      opacity={dimmed ? DIMMED_OPACITY : 1}
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
      <Label>
        <Tag
          fill={selected ? COPPER : INK}
          stroke={selected ? COPPER : PAPER}
          strokeWidth={1}
          cornerRadius={2}
          pointerDirection="down"
          pointerWidth={10}
          pointerHeight={POINTER_HEIGHT}
          shadowColor={INK}
          shadowOpacity={0.25}
          shadowBlur={3}
          shadowOffsetY={1}
        />
        <Text
          text={text}
          fontFamily={PLATE_FONT}
          fontStyle="700"
          fontSize={PLATE_FONT_SIZE}
          letterSpacing={PLATE_SPACING}
          padding={PLATE_PADDING}
          fill={PAPER}
        />
      </Label>
      {badge && (
        // Coin supérieur droit de la plaque ; un retard se voit au double cerclage.
        <Group x={plateWidth(text) / 2} y={-(POINTER_HEIGHT + plateHeight)}>
          {badge.overdue && (
            <Circle radius={12} fill={PAPER} stroke={BADGE_COLORS.ouverte} strokeWidth={2} />
          )}
          <Circle radius={9} fill={BADGE_COLORS[badge.status]} stroke={PAPER} strokeWidth={1.5} />
          <Text
            text={badge.count > 9 ? '9+' : String(badge.count)}
            width={18}
            height={18}
            offsetX={9}
            offsetY={9}
            align="center"
            verticalAlign="middle"
            fontFamily={PLATE_FONT}
            fontStyle="700"
            fontSize={11}
            fill={PAPER}
          />
        </Group>
      )}
    </Group>
  );
}

/**
 * Zone : contour en tirets, à peine teinté, et son nom en haut à gauche, à taille constante à
 * l'écran. Le nom se touche pour choisir la zone ; le rectangle laisse passer les clics.
 */
function ZoneShape({
  zone,
  plan,
  scale,
  active,
  onSelect,
}: {
  zone: Zone;
  plan: Size;
  scale: number;
  active: boolean;
  onSelect?: () => void;
}) {
  const x = zone.bounds.x * plan.width;
  const y = zone.bounds.y * plan.height;
  return (
    <>
      <Rect
        x={x}
        y={y}
        width={zone.bounds.width * plan.width}
        height={zone.bounds.height * plan.height}
        fill={active ? ZONE_ACTIVE_FILL : ZONE_FILL}
        stroke={active ? COPPER : ZONE_INK}
        strokeWidth={(active ? 2 : 1.25) * scale}
        dash={active ? undefined : [6 * scale, 4 * scale]}
        listening={false}
      />
      <Label
        x={x + 4 * scale}
        y={y + 4 * scale}
        scaleX={scale}
        scaleY={scale}
        listening={!!onSelect}
        onClick={onSelect}
        onTap={onSelect}
        onMouseEnter={(event) => {
          const container = event.target.getStage()?.container();
          if (container) container.style.cursor = 'pointer';
        }}
        onMouseLeave={(event) => {
          const container = event.target.getStage()?.container();
          if (container) container.style.cursor = '';
        }}
      >
        <Tag fill={active ? COPPER : 'rgba(255, 255, 255, 0.92)'} cornerRadius={2} />
        <Text
          text={zone.name}
          fontFamily={PLATE_FONT}
          fontStyle="600"
          fontSize={12}
          padding={4}
          fill={active ? PAPER : INK}
        />
      </Label>
    </>
  );
}

/** Zone en cours de tracé : coins marqués, rectangle cuivre une fois le second coin posé. */
function ZoneDraft({ points, scale }: { points: Point[]; scale: number }) {
  const [a, b] = points;
  return (
    <>
      {a && b && (
        <Rect
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.abs(a.x - b.x)}
          height={Math.abs(a.y - b.y)}
          fill={ZONE_ACTIVE_FILL}
          stroke={COPPER}
          strokeWidth={2 * scale}
        />
      )}
      {points.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={5 * scale}
          fill={COPPER}
          stroke={INK}
          strokeWidth={1.5 * scale}
        />
      ))}
    </>
  );
}

/** Segment de mesure : trait jaune cerné d'encre, extrémités marquées, cote au milieu. */
function Segment({
  points,
  label,
  scale,
}: {
  points: Point[];
  label: string | null;
  scale: number;
}) {
  const flat = points.flatMap((p) => [p.x, p.y]);
  const [a, b] = points;
  return (
    <>
      {b && <Line points={flat} stroke={INK} strokeWidth={6 * scale} lineCap="round" />}
      {b && <Line points={flat} stroke={COPPER} strokeWidth={3 * scale} lineCap="round" />}
      {points.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={5 * scale}
          fill={COPPER}
          stroke={INK}
          strokeWidth={1.5 * scale}
        />
      ))}
      {a && b && label && (
        <Label x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} scaleX={scale} scaleY={scale}>
          <Tag
            fill={INK}
            cornerRadius={2}
            pointerDirection="down"
            pointerWidth={8}
            pointerHeight={6}
          />
          <Text
            text={label}
            fontFamily={PLATE_FONT}
            fontStyle="700"
            fontSize={PLATE_FONT_SIZE}
            padding={PLATE_PADDING}
            fill={PAPER}
          />
        </Label>
      )}
    </>
  );
}

/** Barre d'échelle graduée, en bas à gauche, ajustée au zoom. */
function ScaleBar({ screenPixelsPerMeter }: { screenPixelsPerMeter: number }) {
  const bar = scaleBar(screenPixelsPerMeter);
  return (
    <div className="scale-bar" aria-label={`Échelle : ${bar.label}`}>
      <span className="scale-bar-line" style={{ width: bar.pixels }} />
      <span>{bar.label}</span>
    </div>
  );
}
