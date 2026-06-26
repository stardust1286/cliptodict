import React from 'react';
import type { LookupResult } from '../types/domain';

interface ClipOverlayProps {
  onDismiss: () => void;
  onLookupResult: (result: LookupResult) => void;
}

export default function ClipOverlay({ onDismiss }: ClipOverlayProps) {
  // Stub — implemented in Issue #8
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return null;
}
