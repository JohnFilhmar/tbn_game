import { createContext, useContext } from 'react';

/**
 * True where the person looking may not change anything: the desk of a guest. Buttons that submit
 * or change something turn themselves off inside it; the server refuses the guest's writes anyway.
 */
export const ReadOnlyContext = createContext(false);

/** Whether the surrounding screen is read only. */
export function useIsReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
