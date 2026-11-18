'use client';
import { useEffect, useRef } from 'react';
import { registerWorkGuard, type WorkState } from './work-guard';
export function useWorkGuard(state: WorkState) {
  const current = useRef(state);
  current.current = state;
  useEffect(() => registerWorkGuard(() => current.current), []);
}
