import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, Switch, Button, color, Spinner } from 'folds';
import { IPusherRequest } from 'matrix-js-sdk';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { getNotificationState, usePermissionState } from '../../../hooks/usePermission';
import { useEmailNotifications } from '../../../hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  isDesktopApp,
  isMobileApp,
  isNativeApp,
  nativeNotificationPermission,
} from '../../../utils/desktop';
import { NotificationVolume } from './DesktopNotificationSettings';

function EmailNotification() {
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  const [setState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: 'en',
            data: {
              brand: 'Cinny',
            },
            append: true,
          });
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null,
        } as unknown as IPusherRequest);
      },
      [mx]
    )
  );

  const handleChange = (value: boolean) => {
    if (result && result.email) {
      setEnable(result.email, value).then(() => {
        refreshResult();
      });
    }
  };

  return (
    <SettingTile
      title="Email Notification"
      description={
        <>
          {result && !result.email && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Your account does not have any email attached.
            </Text>
          )}
          {result && result.email && <>Send notification to your email. {`("${result.email}")`}</>}
          {result === null && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Unexpected Error!
            </Text>
          )}
          {result === undefined && 'Send notification to your email.'}
        </>
      }
      after={
        <>
          {setState.status !== AsyncStatus.Loading &&
            typeof result === 'object' &&
            result?.email && <Switch value={result.enabled} onChange={handleChange} />}
          {(setState.status === AsyncStatus.Loading || result === undefined) && (
            <Spinner variant="Secondary" />
          )}
        </>
      }
    />
  );
}

export function SystemNotification() {
  const browserPermission = usePermissionState('notifications', getNotificationState());
  // В Cinny Desktop уведомления нативные, разрешение браузера не нужно.
  const [nativePermission, setNativePermission] = useState<'granted' | 'denied' | 'prompt'>(
    'prompt'
  );
  useEffect(() => {
    if (!isMobileApp()) return undefined;
    let active = true;
    const refresh = () => {
      nativeNotificationPermission()
        .then((value) => {
          if (active) setNativePermission(value);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, []);
  let notifPermission = browserPermission;
  if (isDesktopApp()) notifPermission = 'granted';
  if (isMobileApp()) notifPermission = nativePermission;
  let blockedDescription = 'Система не поддерживает уведомления.';
  if ('Notification' in window)
    blockedDescription = 'Уведомления заблокированы. Разрешите их в адресной строке браузера.';
  if (isMobileApp())
    blockedDescription = 'Уведомления заблокированы. Разрешите их в системных настройках Cinny.';
  const [showNotifications, setShowNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );
  const [showContent, setShowContent] = useSetting(settingsAtom, 'notificationShowContent');
  const [soundMentionsOnly, setSoundMentionsOnly] = useSetting(
    settingsAtom,
    'notificationSoundMentionsOnly'
  );

  const requestNotificationPermission = () => {
    if (isMobileApp()) {
      nativeNotificationPermission(true)
        .then(setNativePermission)
        .catch(() => undefined);
    } else {
      window.Notification.requestPermission();
    }
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Системные уведомления</Text>
      {isMobileApp() && (
        <Text size="T200" priority="300">
          В этой предварительной Android-сборке уведомления приходят, пока приложение работает.
          Доставка при закрытом приложении ещё не подключена.
        </Text>
      )}
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Уведомления на рабочем столе"
          description={
            notifPermission === 'denied' ? (
              <Text as="span" style={{ color: color.Critical.Main }} size="T200">
                {blockedDescription}
              </Text>
            ) : (
              <span>
                {isNativeApp()
                  ? 'Системные уведомления о новых сообщениях. Нажатие открывает нужный чат или тред.'
                  : 'Показывать уведомления о новых сообщениях.'}
              </span>
            )
          }
          after={
            notifPermission === 'prompt' ? (
              <Button size="300" radii="300" onClick={requestNotificationPermission}>
                <Text size="B300">Включить</Text>
              </Button>
            ) : (
              <Switch
                disabled={notifPermission !== 'granted'}
                value={showNotifications}
                onChange={setShowNotifications}
              />
            )
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Показывать текст сообщения"
          description="Выключите, если на экран могут смотреть посторонние: в уведомлении останется только отправитель."
          after={
            <Switch disabled={!showNotifications} value={showContent} onChange={setShowContent} />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Звук уведомлений"
          description="Проигрывать звук при новом сообщении."
          after={<Switch value={isNotificationSounds} onChange={setIsNotificationSounds} />}
        />
        <NotificationVolume />
        <SettingTile
          title="Звук только для упоминаний и личных сообщений"
          description="Остальные сообщения приходят беззвучно."
          after={
            <Switch
              disabled={!isNotificationSounds}
              value={soundMentionsOnly}
              onChange={setSoundMentionsOnly}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <EmailNotification />
      </SequenceCard>
    </Box>
  );
}
