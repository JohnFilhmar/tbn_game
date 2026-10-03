import {
  MOST_WHITEBOARD_STROKES,
  type WhiteboardContent,
  type WhiteboardStroke,
} from '@tbn/contracts';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/Button';
import { drawBoard, eraseAt, PEN_COLORS, PEN_WIDTHS } from '@/game/objects/whiteboard/draw';
import { boardFrame } from '@/game/objects/whiteboard/frame';
import { errorMessage } from '@/lib/api/apiError';
import { WhiteboardPens, type BoardTool } from './WhiteboardPens';

/** Props of `WhiteboardDialog`. */
export interface WhiteboardDialogProps {
  /** What is on the board when the owner steps up to it. */
  initial: WhiteboardContent;
  /** The board's colour under the drawing. */
  background: string;
  /** Saves the whole content; called at most once a second while drawing, and on leaving. */
  onSave: (content: WhiteboardContent) => Promise<unknown>;
  onClose: () => void;
}

const SAVE_AFTER_MS = 1_000;
const ERASER = 0.03;
const TEXT_SIZE = 0.08;
const MOST_POINTS = 2_000;

function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Drawing on a whiteboard: a canvas laid exactly over the board, which the camera faces square
 * on, and a toolbar under it with four pens in two widths, an eraser, text, undo and clear.
 * Escape or Done leaves and saves. Text can be written from the keyboard alone.
 */
export function WhiteboardDialog({ initial, background, onSave, onClose }: WhiteboardDialogProps) {
  const [content, setContent] = useState(initial);
  const [history, setHistory] = useState<WhiteboardContent[]>([]);
  const [tool, setTool] = useState<BoardTool>('pen');
  const [color, setColor] = useState<string>(PEN_COLORS[0]);
  const [width, setWidth] = useState<number>(PEN_WIDTHS[0]);
  const [text, setText] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const stroke = useRef<WhiteboardStroke | null>(null);
  const saved = useRef(initial);
  const viewport = useViewport();
  const frame = boardFrame(viewport.width, viewport.height);
  const ratio = window.devicePixelRatio || 1;

  const redraw = (shown: WhiteboardContent): void => {
    const painter = canvasRef.current?.getContext('2d') ?? null;
    if (painter === null) return;
    const canvas = painter.canvas;
    drawBoard(painter, shown, canvas.width, canvas.height, background);
  };

  useEffect(() => {
    redraw(content);
  });

  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  const save = (next: WhiteboardContent): void => {
    if (next === saved.current) return;
    saved.current = next;
    setSaveStatus('Saving…');
    onSave(next)
      .then(() => setSaveStatus('Saved.'))
      .catch((error: unknown) => setSaveStatus(errorMessage(error)));
  };

  useEffect(() => {
    const timer = window.setTimeout(() => save(content), SAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  });

  const leave = (): void => {
    save(content);
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      leave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const change = (next: WhiteboardContent): void => {
    if (next === content) return;
    setHistory((past) => [...past, content].slice(-50));
    setContent(next);
  };

  const isFull = content.strokes.length >= MOST_WHITEBOARD_STROKES;

  const writeText = (x: number, y: number): void => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    change({
      ...content,
      texts: [...content.texts, { x, y, color, size: TEXT_SIZE, text: trimmed.slice(0, 200) }],
    });
    setText('');
  };

  const pointOf = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number): number => Math.min(1, Math.max(0, value));
    return [
      clamp((event.clientX - box.left) / box.width),
      clamp((event.clientY - box.top) / box.height),
    ];
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    const [x, y] = pointOf(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'text') writeText(x, y);
    else if (tool === 'eraser') change(eraseAt(content, x, y, ERASER));
    else if (!isFull) stroke.current = { color, width, points: [[x, y]] };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (event.buttons === 0) return;
    const [x, y] = pointOf(event);
    if (tool === 'eraser') {
      const erased = eraseAt(content, x, y, ERASER);
      if (erased !== content) setContent(erased);
      return;
    }
    const current = stroke.current;
    const last = current?.points.at(-1);
    if (current === null || last === undefined || current.points.length >= MOST_POINTS) return;
    if (Math.hypot(x - last[0], y - last[1]) < 0.003) return;
    current.points.push([Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
    redraw({ ...content, strokes: [...content.strokes, current] });
  };

  const onPointerUp = (): void => {
    const current = stroke.current;
    stroke.current = null;
    if (current !== null) change({ ...content, strokes: [...content.strokes, current] });
  };

  const undo = (): void => {
    const previous = history.at(-1);
    if (previous === undefined) return;
    setHistory((past) => past.slice(0, -1));
    setContent(previous);
  };

  const summary = `${plural(content.strokes.length, 'stroke', 'strokes')} and ${plural(
    content.texts.length,
    'note',
    'notes',
  )} on the board.`;
  const left = (viewport.width - frame.width) / 2;
  const top = (viewport.height - frame.height) / 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Whiteboard"
      className="dark fixed inset-0 z-40"
    >
      <canvas
        ref={canvasRef}
        width={Math.round(frame.width * ratio)}
        height={Math.round(frame.height * ratio)}
        style={{ left, top, width: frame.width, height: frame.height }}
        aria-label="The whiteboard: draw with the pointer"
        className="absolute cursor-crosshair touch-none rounded-sm shadow-chunk"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div
        style={{ top: top + frame.height + 12 }}
        className="absolute inset-x-0 flex justify-center px-3"
      >
        <div className="flex max-w-full flex-wrap items-center gap-2 rounded-lg border-2 border-slate-700 bg-slate-900/90 p-2 text-sm text-slate-100 shadow-chunk">
          <WhiteboardPens
            tool={tool}
            onTool={setTool}
            color={color}
            onColor={setColor}
            width={width}
            onWidth={setWidth}
            firstButtonRef={firstButtonRef}
          />
          <form
            className="flex gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              writeText(0.05, 0.12 + (content.texts.length % 8) * 0.11);
            }}
          >
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label="Text to write"
              placeholder="Text"
              maxLength={200}
              className="w-32 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
            />
            <Button size="sm" type="submit" disabled={text.trim() === ''}>
              Write
            </Button>
          </form>
          <Button size="sm" onClick={undo} disabled={history.length === 0}>
            Undo
          </Button>
          <Button size="sm" onClick={() => change({ strokes: [], texts: [] })}>
            Clear
          </Button>
          <Button size="sm" variant="primary" onClick={leave}>
            Done
          </Button>
          <p role="status" className="basis-full text-xs text-slate-300">
            {summary} {isFull ? 'The board is full: erase something first.' : saveStatus}
          </p>
        </div>
      </div>
    </div>
  );
}
