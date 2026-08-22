'use client';

import { useState } from 'react';
import { track } from '@/lib/track';

export function TrackButton({
  eventName,
  value,
  className,
  children,
}: {
  eventName: string;
  value?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [clicked, setClicked] = useState(false);

  return (
    <button
      type="button"
      className={className}
      disabled={clicked}
      onClick={() => {
        setClicked(true);
        void track(eventName, value);
      }}
    >
      {clicked ? 'Done ✓' : children}
    </button>
  );
}
