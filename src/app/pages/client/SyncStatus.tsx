import { type MatrixClient, SyncState } from 'matrix-js-sdk';
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, config, Text } from 'folds';
import { useSyncState } from '../../hooks/useSyncState';
import { ContainerColor } from '../../styles/ContainerColor.css';

export function SyncStatus({ mx }: { mx: MatrixClient }) {
  const [state, setState] = useState(mx.getSyncState());
  const [online, setOnline] = useState(navigator.onLine);
  const [retryError, setRetryError] = useState('');
  const retry = useCallback(() => {
    try {
      mx.retryImmediately();
      setRetryError('');
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [mx]);
  useSyncState(
    mx,
    useCallback((current) => setState(current), [])
  );
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) retry();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [retry]);
  const failed = !online || state === SyncState.Error || state === SyncState.Reconnecting;
  if (!failed && state !== SyncState.Prepared && state !== SyncState.Catchup) return null;
  let message = 'Синхронизация сообщений…';
  if (failed) message = 'Связь с сервером потеряна. Переподключаемся…';
  if (!online) message = 'Нет сети. Текст сохраняется в черновике; отправка требует подключения.';
  return (
    <Box
      role="status"
      shrink="No"
      gap="200"
      wrap="Wrap"
      alignItems="Center"
      className={ContainerColor({ variant: failed ? 'Warning' : 'Success' })}
      style={{ padding: config.space.S200 }}
    >
      <Text size="T300">{message}</Text>
      {failed && online && (
        <Button size="300" variant="Secondary" onClick={retry}>
          <Text>Повторить подключение</Text>
        </Button>
      )}
      {retryError && <Text role="alert">{retryError}</Text>}
    </Box>
  );
}
