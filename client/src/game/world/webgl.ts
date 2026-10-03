let cached: boolean | undefined;

/** True when this browser can draw the world; checked once, as it costs a context. */
export function canRenderWorld(): boolean {
  if (cached !== undefined) return cached;
  try {
    const canvas = document.createElement('canvas');
    cached = canvas.getContext('webgl2') !== null;
  } catch {
    cached = false;
  }
  return cached;
}
