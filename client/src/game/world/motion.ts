const query =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** True when the device asks for less motion: every glide and fade is then instant. */
export function prefersReducedMotion(): boolean {
  return query?.matches ?? false;
}
