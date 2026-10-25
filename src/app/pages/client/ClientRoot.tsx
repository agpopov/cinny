import { t } from 'i18next';
import {
  Box,
  Button,
  config,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import { HttpApiEvent, HttpApiEventHandlerMap, MatrixClient, SyncState } from 'matrix-js-sdk';
import FocusTrap from 'focus-trap-react';
import React, { MouseEventHandler, ReactNode, useCallback, useEffect, useState } from 'react';
import { clearPrivateStorage } from '../../utils/privateStorage';
import {
  clearCacheAndReload,
  clearLoginData,
  initClient,
  logoutClient,
  startClient,
} from '../../../client/initMatrix';
import { SplashScreen } from '../../components/splash-screen';
import { ServerConfigsLoader } from '../../components/ServerConfigsLoader';
import { CapabilitiesProvider } from '../../hooks/useCapabilities';
import { MediaConfigProvider } from '../../hooks/useMediaConfig';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import { SpecVersions } from './SpecVersions';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useSyncState } from '../../hooks/useSyncState';
import { stopPropagation } from '../../utils/keyboard';
import { SyncStatus } from './SyncStatus';
import { AuthMetadataProvider } from '../../hooks/useAuthMetadata';
import { getFallbackSession } from '../../state/sessions';
import { AutoDiscovery } from './AutoDiscovery';

export function ClientRootLoading() {
  return (
    <SplashScreen>
      <Box direction="Column" grow="Yes" alignItems="Center" justifyContent="Center" gap="400">
        <Spinner variant="Secondary" size="600" />
        <Text>{t('Heating up')}</Text>
      </Box>
    </SplashScreen>
  );
}

function ClientRootOptions({ mx }: { mx?: MatrixClient }) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleToggle: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((currentState) => {
      if (currentState) return undefined;
      return cords;
    });
  };

  return (
    <IconButton
      aria-label="Действия"
      style={{
        position: 'absolute',
        top: config.space.S100,
        right: config.space.S100,
      }}
      variant="Background"
      fill="None"
      onClick={handleToggle}
    >
      <Icon size="200" src={Icons.VerticalDots} />
      <PopOut
        anchor={menuAnchor}
        position="Bottom"
        align="End"
        offset={6}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setMenuAnchor(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {mx && (
                  <MenuItem onClick={() => clearCacheAndReload(mx)} size="300" radii="300">
                    <Text as="span" size="T300" truncate>
                      {t('Clear Cache and Reload')}
                    </Text>
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => {
                    if (mx) {
                      logoutClient(mx);
                      return;
                    }
                    clearLoginData();
                  }}
                  size="300"
                  radii="300"
                  variant="Critical"
                  fill="None"
                >
                  <Text as="span" size="T300" truncate>
                    {t('Logout')}
                  </Text>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </IconButton>
  );
}

const useLogoutListener = (mx?: MatrixClient) => {
  useEffect(() => {
    const handleLogout: HttpApiEventHandlerMap[HttpApiEvent.SessionLoggedOut] = async () => {
      mx?.stopClient();
      await mx?.clearStores();
      await clearPrivateStorage();
      window.localStorage.clear();
      window.location.reload();
    };

    mx?.on(HttpApiEvent.SessionLoggedOut, handleLogout);
    return () => {
      mx?.removeListener(HttpApiEvent.SessionLoggedOut, handleLogout);
    };
  }, [mx]);
};

type ClientRootProps = {
  children: ReactNode;
};
export function ClientRoot({ children }: ClientRootProps) {
  const [loading, setLoading] = useState(true);
  const [cachePrepared, setCachePrepared] = useState(false);
  const { baseUrl, userId } = getFallbackSession() ?? {};

  const [loadState, loadMatrix] = useAsyncCallback<MatrixClient, Error, []>(
    useCallback(() => {
      const session = getFallbackSession();
      if (!session) {
        throw new Error('No session Found!');
      }
      return initClient(session);
    }, [])
  );
  const mx = loadState.status === AsyncStatus.Success ? loadState.data : undefined;
  const [startState, startMatrix] = useAsyncCallback<void, Error, [MatrixClient]>(
    useCallback((m) => startClient(m), [])
  );

  useLogoutListener(mx);

  useEffect(() => {
    if (loadState.status === AsyncStatus.Idle) {
      loadMatrix();
    }
  }, [loadState, loadMatrix]);

  useEffect(() => {
    if (mx && !mx.clientRunning) {
      startMatrix(mx);
    }
  }, [mx, startMatrix]);

  useSyncState(
    mx,
    useCallback((state) => {
      if (state === SyncState.Prepared) setCachePrepared(true);
      if (state === SyncState.Syncing) {
        setLoading(false);
      }
    }, [])
  );

  useEffect(() => {
    if (!cachePrepared || !loading) return undefined;
    // PREPARED may contain only cached rooms. Prefer the first network sync,
    // but keep the cache available if the server cannot be reached.
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, [cachePrepared, loading]);

  return (
    <AutoDiscovery userId={userId!} baseUrl={baseUrl!}>
      <SpecVersions baseUrl={baseUrl!}>
        {mx && <SyncStatus mx={mx} />}
        {loading && <ClientRootOptions mx={mx} />}
        {(loadState.status === AsyncStatus.Error || startState.status === AsyncStatus.Error) && (
          <SplashScreen>
            <Box
              direction="Column"
              grow="Yes"
              alignItems="Center"
              justifyContent="Center"
              gap="400"
            >
              <Dialog>
                <Box direction="Column" gap="400" style={{ padding: config.space.S400 }}>
                  {loadState.status === AsyncStatus.Error && (
                    <Text>
                      {t('Failed to load. {{value1}}', { value1: loadState.error.message })}
                    </Text>
                  )}
                  {startState.status === AsyncStatus.Error && (
                    <Text>
                      {t('Failed to start. {{value1}}', { value1: startState.error.message })}
                    </Text>
                  )}
                  <Button variant="Critical" onClick={mx ? () => startMatrix(mx) : loadMatrix}>
                    <Text as="span" size="B400">
                      {t('Retry')}
                    </Text>
                  </Button>
                </Box>
              </Dialog>
            </Box>
          </SplashScreen>
        )}
        {loading || !mx ? (
          <ClientRootLoading />
        ) : (
          <MatrixClientProvider value={mx}>
            <ServerConfigsLoader>
              {(serverConfigs) => (
                <CapabilitiesProvider value={serverConfigs.capabilities ?? {}}>
                  <MediaConfigProvider value={serverConfigs.mediaConfig ?? {}}>
                    <AuthMetadataProvider value={serverConfigs.authMetadata}>
                      {children}
                    </AuthMetadataProvider>
                  </MediaConfigProvider>
                </CapabilitiesProvider>
              )}
            </ServerConfigsLoader>
          </MatrixClientProvider>
        )}
      </SpecVersions>
    </AutoDiscovery>
  );
}
