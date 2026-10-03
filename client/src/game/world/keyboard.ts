import { useEffect, useRef, type RefObject } from 'react';

/** What a movement key does. */
export type MoveAction = 'forward' | 'back' | 'left' | 'right' | 'run';

/** The keys that move the owner's character, by `KeyboardEvent.code`. */
export const MOVE_BINDINGS: Record<string, MoveAction> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
};

/** True when a key press belongs to a field or an open dialog, not to the world. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return target.closest('dialog[open]') !== null;
}

/**
 * The movement keys held down right now, read every frame without a render. Nothing is held while
 * disabled, and every key is released when the window loses focus.
 */
export function useMovementKeys(isEnabled: boolean): RefObject<Set<MoveAction>> {
  const pressed = useRef<Set<MoveAction>>(new Set());
  useEffect(() => {
    const keys = pressed.current;
    keys.clear();
    if (!isEnabled) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      const action = MOVE_BINDINGS[event.code];
      if (action === undefined) return;
      keys.add(action);
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      const action = MOVE_BINDINGS[event.code];
      if (action !== undefined) keys.delete(action);
    };
    const onBlur = (): void => keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.clear();
    };
  }, [isEnabled]);
  return pressed;
}

/** Runs a handler on a key press by `KeyboardEvent.code`, outside fields and dialogs. */
export function useHotkeys(isEnabled: boolean, bindings: Record<string, () => void>): void {
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });
  useEffect(() => {
    if (!isEnabled) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.defaultPrevented || isTypingTarget(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const handler = latest.current[event.code];
      if (handler === undefined) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEnabled]);
}
