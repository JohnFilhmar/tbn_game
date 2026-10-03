import type { Ref } from 'react';
import { Button } from '@/components/Button';
import { PEN_COLORS, PEN_WIDTHS } from '@/game/objects/whiteboard/draw';

/** What the pointer does on the board. */
export type BoardTool = 'pen' | 'eraser' | 'text';

/** Props of `WhiteboardPens`. */
export interface WhiteboardPensProps {
  tool: BoardTool;
  onTool: (tool: BoardTool) => void;
  color: string;
  onColor: (color: string) => void;
  width: number;
  onWidth: (width: number) => void;
  /** The first button, which takes the focus when the board opens. */
  firstButtonRef: Ref<HTMLButtonElement>;
}

const TOOLS: { tool: BoardTool; label: string }[] = [
  { tool: 'pen', label: 'Pen' },
  { tool: 'eraser', label: 'Eraser' },
  { tool: 'text', label: 'Text' },
];
const COLOR_NAMES = ['black', 'blue', 'red', 'green'] as const;

/** The whiteboard's tool, colour and width choices, each a group of pressed buttons. */
export function WhiteboardPens({
  tool,
  onTool,
  color,
  onColor,
  width,
  onWidth,
  firstButtonRef,
}: WhiteboardPensProps) {
  return (
    <>
      <div role="group" aria-label="Tool" className="flex gap-1">
        {TOOLS.map((each, index) => (
          <Button
            key={each.tool}
            ref={index === 0 ? firstButtonRef : undefined}
            size="sm"
            variant={tool === each.tool ? 'primary' : 'secondary'}
            aria-pressed={tool === each.tool}
            onClick={() => onTool(each.tool)}
          >
            {each.label}
          </Button>
        ))}
      </div>
      <div role="group" aria-label="Colour" className="flex gap-1">
        {PEN_COLORS.map((each, index) => (
          <button
            key={each}
            type="button"
            aria-label={`Colour: ${COLOR_NAMES[index] ?? each}`}
            aria-pressed={color === each}
            onClick={() => onColor(each)}
            style={{ backgroundColor: each }}
            className="size-7 rounded-full border-2 border-slate-600 aria-pressed:border-teal-300 aria-pressed:ring-2 aria-pressed:ring-teal-300"
          />
        ))}
      </div>
      <div role="group" aria-label="Width" className="flex gap-1">
        {PEN_WIDTHS.map((each, index) => (
          <Button
            key={each}
            size="sm"
            variant={width === each ? 'primary' : 'secondary'}
            aria-pressed={width === each}
            onClick={() => onWidth(each)}
          >
            {index === 0 ? 'Thin' : 'Thick'}
          </Button>
        ))}
      </div>
    </>
  );
}
