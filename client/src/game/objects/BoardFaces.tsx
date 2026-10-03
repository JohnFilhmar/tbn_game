import type { WhiteboardContent, WorldPlacement, WorldTheme } from '@tbn/contracts';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { toWorld } from '@/game/props/arrangement';
import { themeColor } from '@/game/props/themes';
import { stateOf, type PropStates } from './propStates';
import { BOARD_ASPECT, BOARD_HEIGHT, BOARD_WIDTH, drawBoard } from './whiteboard/draw';

/** Props of `BoardFaces`. */
export interface BoardFacesProps {
  /** The whiteboard placements of the layout. */
  boards: readonly WorldPlacement[];
  states: PropStates;
  theme: WorldTheme;
}

/** The pixels of a board's texture: sharp from across the room, small enough to redraw. */
const TEXTURE_HEIGHT = 512;

function BoardFace({
  placement,
  content,
  background,
}: {
  placement: WorldPlacement;
  content: WhiteboardContent;
  background: string;
}) {
  // A new texture for each change: a board changes at most once a second while someone draws.
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(TEXTURE_HEIGHT * BOARD_ASPECT);
    canvas.height = TEXTURE_HEIGHT;
    const painter = canvas.getContext('2d');
    if (painter !== null) drawBoard(painter, content, canvas.width, canvas.height, background);
    const made = new CanvasTexture(canvas);
    made.colorSpace = SRGBColorSpace;
    return made;
  }, [content, background]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh
      position={toWorld(placement, [0, 1.6, 0.031])}
      rotation-y={(placement.yaw_deg * Math.PI) / 180}
    >
      <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
      <meshStandardMaterial map={texture} roughness={0.9} />
    </mesh>
  );
}

/**
 * What is drawn on each whiteboard, painted onto its face, so the drawing stays on the wall for
 * as long as the board is there. An empty board needs no face of its own.
 */
export function BoardFaces({ boards, states, theme }: BoardFacesProps) {
  const background = themeColor(theme, 'board');
  return (
    <>
      {boards.map((placement) => {
        const content = stateOf.board(states, placement.id);
        if (content.strokes.length === 0 && content.texts.length === 0) return null;
        return (
          <BoardFace
            key={placement.id}
            placement={placement}
            content={content}
            background={background}
          />
        );
      })}
    </>
  );
}
