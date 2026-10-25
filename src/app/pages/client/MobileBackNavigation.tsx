import { useEffect } from 'react';
import { useStore } from 'jotai';
import { useLocation, useNavigate } from 'react-router-dom';
import { isMobileApp } from '../../utils/desktop';
import { getBackPath } from '../../utils/backNavigation';
import { roomIdToThreadPanelAtomFamily } from '../../state/room/threadPanel';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';

export function MobileBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const roomId = useSelectedRoom();
  const store = useStore();
  useEffect(() => {
    if (!isMobileApp()) return undefined;
    const onBack = (event: Event) => {
      // Dialogs and menus already implement Escape, including focus restoration.
      if (document.querySelector('[role="dialog"], [role="menu"]')) {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          })
        );
        event.preventDefault();
        return;
      }
      if (roomId) {
        const panel = roomIdToThreadPanelAtomFamily(roomId);
        if (store.get(panel)) {
          store.set(panel, undefined);
          event.preventDefault();
          return;
        }
      }
      const path = getBackPath(location.pathname);
      if (path) {
        event.preventDefault();
        navigate(path, { replace: true });
      }
    };
    window.addEventListener('cinny:back', onBack);
    return () => window.removeEventListener('cinny:back', onBack);
  }, [location.pathname, navigate, roomId, store]);
  return null;
}
