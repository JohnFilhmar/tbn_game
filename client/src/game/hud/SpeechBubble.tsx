import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { livePositions, liveView } from '@/game/world/livePositions';
import { useWorldStore } from '@/game/world/worldStore';
import { useTranscript } from '@/lib/data/useTranscript';
import { useStreamStore } from '@/lib/stores/streamStore';

/** How much of a long reply the bubble shows: its last characters. */
const MOST_CHARACTERS = 120;
/** How high over the agent's feet the bubble's tip sits, in metres. */
const ABOVE = 2.15;
/** The gap the bubble keeps from the edges of the screen, in pixels. */
const EDGE = 8;

/** Props of `SpeechBubble`. */
export interface SpeechBubbleProps {
  agentId: string;
}

/**
 * What the agent is saying, in a bubble over its head: the reply it is writing now, or its last
 * reply once that settles. It follows the agent on screen every frame without a render. It is
 * hidden from assistive technology; the conversation panel carries the same words.
 */
export function SpeechBubble({ agentId }: SpeechBubbleProps) {
  const reply = useStreamStore((state) => state.replies[agentId]);
  const transcript = useTranscript(agentId);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const lastReply = (transcript.data ?? []).filter((entry) => entry.kind === 'assistant').at(-1);
  const settled =
    lastReply?.kind === 'assistant'
      ? lastReply.content.blocks
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join(' ')
      : '';
  // The line an agent took a command with shows until it says something newer.
  const acknowledgement = useWorldStore((state) => state.acknowledgement);
  const isStreaming = reply !== undefined && reply.text.length > 0;
  const isAcknowledging =
    acknowledgement?.agentId === agentId &&
    !isStreaming &&
    (lastReply === undefined || Date.parse(lastReply.created_at) < acknowledgement.at);
  const said = isAcknowledging ? acknowledgement.line : isStreaming ? reply.text : settled;
  const text = said.length > MOST_CHARACTERS ? `…${said.slice(-MOST_CHARACTERS)}` : said;

  useEffect(() => {
    const point = new Vector3();
    let frame = 0;
    const follow = (): void => {
      frame = window.requestAnimationFrame(follow);
      const bubble = bubbleRef.current;
      const camera = liveView.camera;
      const at = livePositions.get(agentId);
      if (bubble === null) return;
      if (camera === null || at === undefined) {
        bubble.style.visibility = 'hidden';
        return;
      }
      point.set(at.x, ABOVE, at.z).project(camera);
      const isInView = point.z < 1 && Math.abs(point.x) < 1.2 && Math.abs(point.y) < 1.2;
      bubble.style.visibility = isInView ? 'visible' : 'hidden';
      // Kept whole on screen, so a bubble over an agent near an edge is never cut off.
      const half = bubble.offsetWidth / 2;
      const x = Math.min(
        window.innerWidth - half - EDGE,
        Math.max(half + EDGE, ((point.x + 1) / 2) * window.innerWidth),
      );
      const y = ((1 - point.y) / 2) * window.innerHeight;
      bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    };
    follow();
    return () => window.cancelAnimationFrame(frame);
  }, [agentId]);

  if (text.length === 0) return null;
  return (
    <div
      ref={bubbleRef}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-40 max-w-64"
    >
      <p className="rounded-lg border-2 border-slate-700 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-chunk motion-safe:animate-pop-in">
        {text}
      </p>
    </div>
  );
}
