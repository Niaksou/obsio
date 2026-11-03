import { Canvas, hex } from './raster.js';

// Plans et photos de la démonstration. Coordonnées en proportion de l'image (0 à 1), comme les
// positions des équipements.

export type Box = [x: number, y: number, w: number, h: number];

export interface PlanDrawing {
  width: number;
  height: number;
  /** Pièces : contour en murs intérieurs. */
  rooms: Box[];
  /** Ouvertures percées dans les murs. */
  doors: Box[];
  /** Machines, rayonnages, mobilier : blocs gris. */
  blocks: Box[];
  /** Escaliers : hachures. */
  stairs?: Box[];
}

const WALL = hex('#26323c');
const PAPER = hex('#ffffff');
const BLOCK = hex('#dde2e5');
const BLOCK_EDGE = hex('#9aa5ad');

export function drawPlan(plan: PlanDrawing): Buffer {
  const { width, height } = plan;
  const canvas = new Canvas(width, height, PAPER);
  const px = ([x, y, w, h]: Box): Box => [x * width, y * height, w * width, h * height];
  // Mur extérieur à 1,5 % des bords : les pièces s'y alignent (0,015 à 0,985).
  const [mx, my] = [width * 0.015, height * 0.015];
  canvas.stroke(mx, my, width - 2 * mx, height - 2 * my, 12, WALL);
  for (const room of plan.rooms) {
    const [x, y, w, h] = px(room);
    canvas.stroke(x, y, w, h, 6, WALL);
  }
  for (const door of plan.doors) {
    const [x, y, w, h] = px(door);
    canvas.fill(x, y, w, h, PAPER);
  }
  for (const block of plan.blocks) {
    const [x, y, w, h] = px(block);
    canvas.fill(x, y, w, h, BLOCK);
    canvas.stroke(x, y, w, h, 2, BLOCK_EDGE);
  }
  for (const stair of plan.stairs ?? []) {
    const [x, y, w, h] = px(stair);
    canvas.stroke(x, y, w, h, 2, WALL);
    for (let step = x + 14; step < x + w; step += 14) canvas.fill(step, y, 2, h, WALL);
  }
  return canvas.png();
}

/** Photo de coffret électrique ; `variant` change les couleurs et la disposition. */
export function drawProofPhoto(variant: number): Buffer {
  const walls = ['#c9c4b8', '#b9c2c8', '#d3cbbd', '#c0c7bd'];
  const canvas = new Canvas(960, 720, hex(walls[variant % walls.length]!));
  // Coffret
  const left = 180 + (variant % 3) * 30;
  canvas.fill(left, 90, 600, 540, hex('#e9eaeb'));
  canvas.stroke(left, 90, 600, 540, 8, hex('#8d969c'));
  // Rangées de disjoncteurs
  for (let row = 0; row < 3; row++) {
    const top = 150 + row * 150;
    canvas.fill(left + 40, top, 520, 16, hex('#9ea6ab'));
    const count = 8 + ((variant + row) % 4);
    for (let i = 0; i < count; i++) {
      const x = left + 50 + i * 42;
      canvas.fill(x, top + 22, 34, 80, hex('#30363c'));
      canvas.fill(x + 10, top + 34 + ((i + variant) % 2) * 30, 14, 22, hex('#f2f2f2'));
    }
    // Étiquette de repérage
    canvas.fill(left + 50, top + 108, 480, 14, hex(variant % 2 ? '#f5f0d8' : '#ffffff'));
  }
  // Pastille verte : correction faite
  canvas.fill(left + 520, 110, 50, 24, hex('#2e7d4f'));
  return canvas.png();
}
