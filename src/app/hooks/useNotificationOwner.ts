import { useEffect, useState } from 'react';

const instanceId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
  value.toString(16)
).join('-');
const users = new Map<string, number>();
const leaseMs = 15_000;
const keyFor = (userId: string) => `cinny.notification-owner:${userId}`;

/** Elect one local window. Server receipts additionally suppress notices read on another device. */
export const ownsNotifications = (userId: string, claim = false): boolean => {
  try {
    const key = keyFor(userId);
    const raw = localStorage.getItem(key);
    let lease: { id?: string; until?: number } | undefined;
    try {
      lease = raw ? JSON.parse(raw) : undefined;
    } catch {
      lease = undefined;
    }
    if (
      claim ||
      !lease ||
      typeof lease.until !== 'number' ||
      !Number.isFinite(lease.until) ||
      typeof lease.id !== 'string' ||
      lease.until <= Date.now() ||
      lease.id === instanceId
    ) {
      localStorage.setItem(key, JSON.stringify({ id: instanceId, until: Date.now() + leaseMs }));
      return true;
    }
    return false;
  } catch {
    return true;
  }
};

export const useNotificationOwner = (userId: string): boolean => {
  const [owner, setOwner] = useState(() => ownsNotifications(userId));
  useEffect(() => {
    users.set(userId, (users.get(userId) ?? 0) + 1);
    const update = () => setOwner(ownsNotifications(userId));
    const focus = () => setOwner(ownsNotifications(userId, document.hasFocus()));
    focus();
    const timer = setInterval(update, 5000);
    window.addEventListener('focus', focus);
    window.addEventListener('storage', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      window.removeEventListener('storage', update);
      users.set(userId, (users.get(userId) ?? 1) - 1);
      if (users.get(userId)) return;
      users.delete(userId);
      try {
        const key = keyFor(userId);
        if (JSON.parse(localStorage.getItem(key) ?? 'null')?.id === instanceId)
          localStorage.removeItem(key);
      } catch {
        /* Storage can be unavailable in a private profile. */
      }
    };
  }, [userId]);
  return owner;
};
