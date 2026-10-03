import type { WhiteboardContent } from '@tbn/contracts';

/** The board's size in metres, as `furniture.ts` builds it. */
export const BOARD_WIDTH = 1.8;
export const BOARD_HEIGHT = 1.1;
/** The board's width over its height. */
export const BOARD_ASPECT = BOARD_WIDTH / BOARD_HEIGHT;

/** The pen colours and widths, the widths as shares of the board's height. */
export const PEN_COLORS = ['#1f2937', '#2563eb', '#dc2626', '#16a34a'] as const;
export const PEN_WIDTHS = [0.006, 0.016] as const;

/** The 2D drawing calls a board needs, so a test can record them. */
export type BoardPainter = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'font'
  | 'fillRect'
  | 'clearRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'arc'
  | 'fill'
  | 'fillText'
>;

/**
 * Draws a board's content onto a canvas of `width` by `height` pixels, over `background`, or over
 * nothing when it is null. The 3D board and the drawing dialog both draw with it.
 */
export function drawBoard(
  painter: BoardPainter,
  content: WhiteboardContent,
  width: number,
  height: number,
  background: string | null,
): void {
  if (background === null) {
    painter.clearRect(0, 0, width, height);
  } else {
    painter.fillStyle = background;
    painter.fillRect(0, 0, width, height);
  }
  painter.lineCap = 'round';
  painter.lineJoin = 'round';
  for (const stroke of content.strokes) {
    const [first, ...rest] = stroke.points;
    if (first === undefined) continue;
    painter.beginPath();
    if (rest.length === 0) {
      painter.fillStyle = stroke.color;
      painter.arc(first[0] * width, first[1] * height, (stroke.width * height) / 2, 0, Math.PI * 2);
      painter.fill();
      continue;
    }
    painter.strokeStyle = stroke.color;
    painter.lineWidth = stroke.width * height;
    painter.moveTo(first[0] * width, first[1] * height);
    for (const [x, y] of rest) painter.lineTo(x * width, y * height);
    painter.stroke();
  }
  for (const text of content.texts) {
    painter.fillStyle = text.color;
    painter.font = `${Math.round(text.size * height)}px sans-serif`;
    painter.fillText(text.text, text.x * width, text.y * height);
  }
}

/**
 * The content with every stroke and text under the eraser removed: a circle of `radius` (a share
 * of the board's height) at (`x`, `y`). The same object when nothing was under it.
 */
export function eraseAt(
  content: WhiteboardContent,
  x: number,
  y: number,
  radius: number,
): WhiteboardContent {
  // Shares of the width are longer than shares of the height; this keeps the circle round.
  const isNear = (px: number, py: number): boolean =>
    Math.hypot((px - x) * BOARD_ASPECT, py - y) <= radius;
  const strokes = content.strokes.filter(
    (stroke) => !stroke.points.some(([px, py]) => isNear(px, py)),
  );
  const texts = content.texts.filter((text) => {
    const right = text.x + (text.text.length * text.size * 0.55) / BOARD_ASPECT;
    const isInside = x >= text.x && x <= right && y <= text.y && y >= text.y - text.size;
    return !isInside;
  });
  if (strokes.length === content.strokes.length && texts.length === content.texts.length) {
    return content;
  }
  return { strokes, texts };
}
