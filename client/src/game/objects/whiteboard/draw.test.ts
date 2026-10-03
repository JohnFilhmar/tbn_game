import {
  MOST_WHITEBOARD_STROKES,
  WhiteboardContentSchema,
  type WhiteboardContent,
} from '@tbn/contracts';
import { describe, expect, it } from 'vitest';
import { drawBoard, eraseAt, type BoardPainter } from './draw';

const CONTENT: WhiteboardContent = {
  strokes: [
    {
      color: '#2563eb',
      width: 0.006,
      points: [
        [0.1, 0.1],
        [0.3, 0.2],
        [0.5, 0.25],
      ],
    },
    { color: '#dc2626', width: 0.016, points: [[0.8, 0.8]] },
  ],
  texts: [{ x: 0.1, y: 0.6, color: '#1f2937', size: 0.08, text: 'Plan' }],
};

/** A painter that writes down what it is asked to draw. */
function recorder(): BoardPainter & { calls: string[] } {
  const calls: string[] = [];
  const note =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push(`${name}(${args.map(String).join(',')})`);
    };
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    fillRect: note('fillRect'),
    clearRect: note('clearRect'),
    beginPath: note('beginPath'),
    moveTo: note('moveTo'),
    lineTo: note('lineTo'),
    stroke: note('stroke'),
    arc: note('arc'),
    fill: note('fill'),
    fillText: note('fillText'),
  };
}

describe('the whiteboard content', () => {
  it('survives a round trip to JSON and redraws the same', () => {
    const back = WhiteboardContentSchema.parse(JSON.parse(JSON.stringify(CONTENT)));
    expect(back).toEqual(CONTENT);
    const before = recorder();
    const after = recorder();
    drawBoard(before, CONTENT, 900, 550, '#ffffff');
    drawBoard(after, back, 900, 550, '#ffffff');
    expect(after.calls).toEqual(before.calls);
    expect(after.calls).toContain('moveTo(90,55)');
    expect(after.calls).toContain('lineTo(450,137.5)');
    expect(after.calls.filter((call) => call.startsWith('stroke('))).toHaveLength(1);
    expect(after.calls.filter((call) => call.startsWith('arc('))).toHaveLength(1);
    expect(after.calls).toContain('fillText(Plan,90,330)');
  });

  it('keeps to its caps and its board', () => {
    const stroke = { color: '#1f2937', width: 0.006, points: [[0.5, 0.5]] };
    const full = {
      strokes: Array.from({ length: MOST_WHITEBOARD_STROKES }, () => stroke),
      texts: [],
    };
    expect(WhiteboardContentSchema.safeParse(full).success).toBe(true);
    const over = { ...full, strokes: [...full.strokes, stroke] };
    expect(WhiteboardContentSchema.safeParse(over).success).toBe(false);
    const offBoard = { strokes: [{ ...stroke, points: [[1.2, 0.5]] }], texts: [] };
    expect(WhiteboardContentSchema.safeParse(offBoard).success).toBe(false);
    const badColour = { strokes: [{ ...stroke, color: 'blue' }], texts: [] };
    expect(WhiteboardContentSchema.safeParse(badColour).success).toBe(false);
  });

  it('erases one stroke or text at a time under the eraser', () => {
    const lessStroke = eraseAt(CONTENT, 0.3, 0.2, 0.02);
    expect(lessStroke.strokes).toHaveLength(1);
    expect(lessStroke.texts).toHaveLength(1);
    const lessText = eraseAt(CONTENT, 0.12, 0.58, 0.02);
    expect(lessText.texts).toEqual([]);
    expect(eraseAt(CONTENT, 0.95, 0.05, 0.02)).toBe(CONTENT);
  });
});
