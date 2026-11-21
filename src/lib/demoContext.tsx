import { createContext, useContext } from 'react';
import type { DemoState } from './demoEngine';

export interface DemoContextValue {
  isDemo: boolean;
  demoState: DemoState;
  setDemoState: (updater: (prev: DemoState) => DemoState) => void;
  resetDemo: () => void;
  exitDemo: () => void;
}

export const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue | null {
  return useContext(DemoContext);
}
