import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { livePositions, liveView } from '@/game/world/livePositions';
import { useTranscript } from '@/lib/data/useTranscript';
import { useStreamStore } from '@/lib/stores/streamStore';

/** How much of a long reply the bubble shows: its last characters. */
const MOST_CHARACTERS = 120;
/** How high over the agent's feet the bubble's tip sits, in metres. */
const ABOVE = 2.15;

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
  const said = reply !== undefined && reply.text.length > 0 ? reply.text : settled;
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
      const x = ((point.x + 1) / 2) * window.innerWidth;
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
      className="pointer-events-none fixed top-0 left-0 z-20 max-w-64"
    >
      <p className="rounded-lg border-2 border-slate-700 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-chunk motion-safe:animate-pop-in">
        {text}
      </p>
    </div>
  );
}
