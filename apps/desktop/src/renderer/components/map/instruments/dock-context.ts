import { createContext, useContext } from 'react';

/** True inside a docked group: card primitives drop their own chrome
 * (face, border, shadow, radius) and let the shared group card carry it. */
export const DockedContext = createContext(false);

export function useInDock(): boolean {
  return useContext(DockedContext);
}
