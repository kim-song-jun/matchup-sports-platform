'use client';

import { useEffect, useState } from 'react';
import { useV1NotificationSocket } from '@/hooks/use-v1-realtime-socket';
import { hasStoredV1Session } from '@/lib/session-storage';

export function NotificationSocketBridge() {
  const [hasSessionHint, setHasSessionHint] = useState(false);

  useEffect(() => {
    setHasSessionHint(hasStoredV1Session());
  }, []);

  return hasSessionHint ? <NotificationSocketMount /> : null;
}

function NotificationSocketMount() {
  useV1NotificationSocket();
  return null;
}
