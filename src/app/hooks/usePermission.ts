import { useEffect, useState } from 'react';

export const getNotificationState = (): PermissionState => {
  if ('Notification' in window) {
    if (window.Notification.permission === 'default') {
      return 'prompt';
    }

    return window.Notification.permission;
  }

  return 'denied';
};

export function usePermissionState(name: PermissionName, initialValue: PermissionState = 'prompt') {
  const [permissionState, setPermissionState] = useState<PermissionState>(initialValue);

  useEffect(() => {
    let active = true;
    let permissionStatus: PermissionStatus | undefined;

    const refreshNotificationState = () => {
      if (name === 'notifications') setPermissionState(getNotificationState());
    };

    function handlePermissionChange(this: PermissionStatus) {
      setPermissionState(this.state);
    }

    const queryPermission = async () => {
      try {
        const status = await navigator.permissions?.query({ name });
        if (!active || !status) return;
        permissionStatus = status;
        handlePermissionChange.apply(status);
        status.addEventListener('change', handlePermissionChange);
      } catch {
        // Permission names vary between browsers; Notification.permission is
        // also available where querying notification permissions is unsupported.
      }
    };

    refreshNotificationState();
    queryPermission();
    window.addEventListener('focus', refreshNotificationState);
    document.addEventListener('visibilitychange', refreshNotificationState);

    return () => {
      active = false;
      permissionStatus?.removeEventListener('change', handlePermissionChange);
      window.removeEventListener('focus', refreshNotificationState);
      document.removeEventListener('visibilitychange', refreshNotificationState);
    };
  }, [name]);

  return permissionState;
}
