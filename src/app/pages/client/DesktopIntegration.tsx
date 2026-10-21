/**
 * Уведомления о сообщениях, звук, режим «Не беспокоить» и интеграция с
 * десктопной обёрткой (трей, счётчик на панели задач, клик по уведомлению).
 *
 * В Cinny Desktop уведомления показываются нативно через Windows (WinRT toast),
 * в браузере — через Web Notification API, как раньше.
 */
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientEvent, MatrixEvent, Room, SyncState } from 'matrix-js-sdk';
import LogoSVG from '../../../../public/res/svg/cinny.svg';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '../../hooks/router/useInbox';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { usePreviousValue } from '../../hooks/usePreviousValue';
import { Settings, settingsAtom } from '../../state/settings';
import { useSetting } from '../../state/hooks/settings';
import { allInvitesAtom } from '../../state/room-list/inviteList';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { mDirectAtom } from '../../state/mDirectList';
import { roomIdToThreadPanelAtomFamily } from '../../state/room/threadPanel';
import { userSettingsModalAtom } from '../../state/userSettingsModal';
import { getInboxInvitesPath } from '../pathUtils';
import { playInviteSound, playNotificationSound } from '../../utils/notificationSound';
import { getNotificationType, isFollowedThread, isNotificationEvent } from '../../utils/room';
import { NotificationType } from '../../../types/matrix/room';
import { mxcUrlToHttp } from '../../utils/matrix';
import { notificationPermission } from '../../utils/dom';
import {
  DesktopEvent,
  DndMode,
  NotificationTarget,
  desktopNotify,
  desktopSetDnd,
  desktopSetUnread,
  isNativeApp,
  isMobileApp,
  nativeNotificationPermission,
  onDesktopEvent,
} from '../../utils/desktop';
import { dndUntilFromMode, isDndActive, manualDndActive } from '../../utils/dnd';
import {
  getEventPreviewText,
  getNotificationAvatar,
  getSenderAvatarMxc,
  getSenderName,
  renderUnreadBadge,
} from '../../utils/notificationContent';

/** События старше этого не показываем (догонялка после сна/разрыва сети). */
const MAX_NOTIFY_AGE_MS = 10 * 60 * 1000;
/** Страница «Уведомления» в окне настроек (SettingsPages.NotificationPage). */
const NOTIFICATION_SETTINGS_PAGE = 2;

// ---------------------------------------------------------------------------
// Открытие комнаты/треда по клику на уведомление
// ---------------------------------------------------------------------------

const useOpenNotificationTarget = () => {
  const { navigateRoom } = useRoomNavigate();
  const store = useStore();
  return useCallback(
    (target: NotificationTarget) => {
      if (target.threadId) {
        navigateRoom(target.roomId);
        store.set(roomIdToThreadPanelAtomFamily(target.roomId), {
          view: 'thread',
          rootId: target.threadId,
          eventId: target.eventId,
        });
        return;
      }
      navigateRoom(target.roomId, target.eventId);
    },
    [navigateRoom, store]
  );
};

// ---------------------------------------------------------------------------
// Показ уведомления
// ---------------------------------------------------------------------------

type NotificationContent = {
  title: string;
  body: string;
  attribution?: string;
  iconId: string;
  iconName: string;
  iconMxc?: string;
  target: NotificationTarget;
};

const showSystemNotification = async (
  mx: ReturnType<typeof useMatrixClient>,
  useAuthentication: boolean,
  content: NotificationContent,
  onBrowserClick: (target: NotificationTarget) => void
) => {
  if (isNativeApp()) {
    const icon = await getNotificationAvatar(
      mx,
      useAuthentication,
      content.iconId,
      content.iconName,
      content.iconMxc
    ).catch(() => undefined);
    await desktopNotify({
      title: content.title,
      body: content.body,
      attribution: content.attribution,
      icon,
      iconKey: content.iconMxc ?? `letter:${content.iconId}`,
      target: content.target,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('Не удалось показать системное уведомление', err);
    });
    return;
  }

  if (!notificationPermission('granted')) return;
  const iconUrl = content.iconMxc
    ? mxcUrlToHttp(mx, content.iconMxc, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;
  const noti = new window.Notification(content.title, {
    icon: iconUrl ?? LogoSVG,
    badge: LogoSVG,
    body: content.attribution ? `${content.body}\n${content.attribution}` : content.body,
    tag: content.target.threadId ?? content.target.roomId,
    silent: true,
  });
  noti.onclick = () => {
    window.focus();
    onBrowserClick(content.target);
    noti.close();
  };
};

const buildMessageNotification = (
  room: Room,
  mEvent: MatrixEvent,
  opts: { isDirect: boolean; threadRootId?: string; showContent: boolean }
): NotificationContent => {
  const senderId = mEvent.getSender() ?? '';
  const senderName = getSenderName(room, senderId);
  const roomName = room.name || 'Без названия';
  const text = opts.showContent ? getEventPreviewText(mEvent, room) : 'Новое сообщение';

  let attribution: string | undefined;
  if (opts.threadRootId) {
    const root = room.findEventById(opts.threadRootId);
    const rootText = root && opts.showContent ? getEventPreviewText(root, room) : undefined;
    attribution = rootText ? `В треде: ${rootText.slice(0, 80)}` : 'Ответ в треде';
  }

  return {
    title: opts.isDirect ? senderName : `${roomName}${opts.threadRootId ? ' › тред' : ''}`,
    body: opts.isDirect ? text : `${senderName}: ${text}`,
    attribution,
    iconId: senderId,
    iconName: senderName,
    iconMxc: getSenderAvatarMxc(room, senderId),
    target: {
      roomId: room.roomId,
      eventId: mEvent.getId(),
      threadId: opts.threadRootId,
    },
  };
};

// ---------------------------------------------------------------------------
// Сообщения
// ---------------------------------------------------------------------------

export function MessageNotifications() {
  const mx = useMatrixClient();
  const store = useStore();
  const useAuthentication = useMediaAuthentication();
  const settings = useAtomValue(settingsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const selectedRoomId = useSelectedRoom();
  const notificationSelected = useInboxNotificationsSelected();
  const openTarget = useOpenNotificationTarget();

  // Обработчик подписывается один раз, актуальные значения читаем из ref.
  const ctx = useRef({
    settings,
    mDirects,
    selectedRoomId,
    notificationSelected,
    useAuthentication,
    openTarget,
  });
  ctx.current = {
    settings,
    mDirects,
    selectedRoomId,
    notificationSelected,
    useAuthentication,
    openTarget,
  };

  useEffect(() => {
    const seen = new Set<string>();
    const remember = (id: string) => {
      seen.add(id);
      if (seen.size > 500) {
        const first = seen.values().next().value;
        if (first) seen.delete(first);
      }
    };

    const handleEvent = async (mEvent: MatrixEvent) => {
      if (mx.getSyncState() !== SyncState.Syncing) return;
      const eventId = mEvent.getId();
      const roomId = mEvent.getRoomId();
      const senderId = mEvent.getSender();
      if (!eventId || !roomId || !senderId || seen.has(eventId)) return;
      if (senderId === mx.getUserId()) return;
      if ((mEvent.getAge() ?? 0) > MAX_NOTIFY_AGE_MS) return;

      const room = mx.getRoom(roomId);
      if (!room || room.isSpaceRoom() || room.getMyMembership() !== 'join') return;
      remember(eventId);

      if (mEvent.isEncrypted()) {
        await mx.decryptEventIfNeeded(mEvent).catch(() => undefined);
      }
      if (!isNotificationEvent(mEvent)) return;
      if (getNotificationType(mx, roomId) === NotificationType.Mute) return;

      // Правила push сервера учитывают режимы комнат («только упоминания» и т.п.).
      const actions = mx.getPushActionsForEvent(mEvent, mEvent.isEncrypted());
      if (!actions?.notify) return;
      const highlight = !!actions.tweaks?.highlight;

      const c = ctx.current;
      const isDirect = c.mDirects.has(roomId);
      const { threadRootId } = mEvent;
      const isThreadReply = !!threadRootId && threadRootId !== eventId;

      // Как в Discord: ответы в чужих тредах не беспокоят, если вас не упомянули.
      if (isThreadReply && !highlight) {
        const thread = room.getThread(threadRootId);
        const followed = thread
          ? isFollowedThread(room, thread)
          : room.findEventById(threadRootId)?.getSender() === mx.getUserId();
        if (!followed) return;
      }

      // Пользователь уже смотрит на это сообщение.
      if (document.hasFocus()) {
        if (c.notificationSelected) return;
        if (c.selectedRoomId === roomId) {
          if (!isThreadReply) return;
          const panel = store.get(roomIdToThreadPanelAtomFamily(roomId));
          if (panel?.view === 'thread' && panel.rootId === threadRootId) return;
        }
      }

      const s: Settings = c.settings;
      const important = highlight || isDirect;
      if (isDndActive(s) && !(s.dndAllowMentions && important)) return;

      if (s.showNotifications) {
        const content = buildMessageNotification(room, mEvent, {
          isDirect,
          threadRootId: isThreadReply ? threadRootId : undefined,
          showContent: s.notificationShowContent,
        });
        showSystemNotification(mx, c.useAuthentication, content, c.openTarget);
      }

      if (s.isNotificationSounds && (!s.notificationSoundMentionsOnly || important)) {
        playNotificationSound(s.notificationVolume);
      }
    };

    mx.on(ClientEvent.Event, handleEvent);
    return () => {
      mx.removeListener(ClientEvent.Event, handleEvent);
    };
  }, [mx, store]);

  return null;
}

// ---------------------------------------------------------------------------
// Приглашения
// ---------------------------------------------------------------------------

export function InviteNotifications() {
  const mx = useMatrixClient();
  const invites = useAtomValue(allInvitesAtom);
  const previousInviteLen = usePreviousValue(invites.length, 0);
  const navigate = useNavigate();
  const settings = useAtomValue(settingsAtom);

  useEffect(() => {
    if (invites.length <= previousInviteLen || mx.getSyncState() !== SyncState.Syncing) return;
    if (isDndActive(settings)) return;
    const count = invites.length - previousInviteLen;

    if (settings.showNotifications) {
      if (isNativeApp()) {
        desktopNotify({
          title: 'Приглашение',
          body: count > 1 ? `Новых приглашений: ${count}` : 'Вас пригласили в комнату',
          target: { roomId: '' },
        }).catch(() => undefined);
      } else if (notificationPermission('granted')) {
        const noti = new window.Notification('Приглашение', {
          icon: LogoSVG,
          badge: LogoSVG,
          body: count > 1 ? `Новых приглашений: ${count}` : 'Вас пригласили в комнату',
          silent: true,
        });
        noti.onclick = () => {
          if (!window.closed) navigate(getInboxInvitesPath());
          noti.close();
        };
      }
    }
    if (settings.isNotificationSounds) {
      playInviteSound(settings.notificationVolume);
    }
  }, [mx, invites, previousInviteLen, settings, navigate]);

  return null;
}

// ---------------------------------------------------------------------------
// Десктоп: счётчик непрочитанного, трей, «Не беспокоить»
// ---------------------------------------------------------------------------

function DesktopUnreadBadge() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const last = useRef<string>();

  useEffect(() => {
    let total = 0;
    let highlight = false;
    let hasUnread = false;
    roomToUnread.forEach((unread, roomId) => {
      // Пространства агрегируют детей — считаем только сами комнаты.
      if (roomId.startsWith('!') && unread.from === null) {
        hasUnread = true;
        total += unread.total;
        if (unread.highlight > 0) highlight = true;
      }
    });
    const key = `${total}:${highlight}:${hasUnread}`;
    if (key === last.current) return;
    last.current = key;
    const badge = hasUnread ? renderUnreadBadge(total, highlight) : undefined;
    desktopSetUnread(total, highlight, badge, hasUnread).catch(() => undefined);
  }, [roomToUnread]);

  return null;
}

function DesktopDndSync() {
  const [dndUntil, setDndUntil] = useSetting(settingsAtom, 'dndUntil');
  const settings = useAtomValue(settingsAtom);
  const active = isDndActive(settings);

  // Состояние в трее.
  useEffect(() => {
    desktopSetDnd(active).catch(() => undefined);
  }, [active]);

  // Ручной режим истекает сам; тихие часы проверяем раз в минуту.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (dndUntil > 0 && !manualDndActive(dndUntil)) setDndUntil(0);
      desktopSetDnd(isDndActive(settings)).catch(() => undefined);
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [dndUntil, setDndUntil, settings]);

  return null;
}

function DesktopEventBridge() {
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  useEffect(() => {
    if (!isMobileApp() || !showNotifications) return;
    nativeNotificationPermission()
      .then((permission) => {
        if (permission === 'prompt') return nativeNotificationPermission(true);
        return permission;
      })
      .catch(() => undefined);
  }, [showNotifications]);
  const setDndUntil = useSetting(settingsAtom, 'dndUntil')[1];
  const setSettingsModal = useSetAtom(userSettingsModalAtom);
  const openTarget = useOpenNotificationTarget();
  const navigate = useNavigate();

  const openTargetRef = useRef(openTarget);
  openTargetRef.current = openTarget;

  useEffect(() => {
    const unlisteners = [
      onDesktopEvent<NotificationTarget>(DesktopEvent.NotificationClick, (target) => {
        if (!target.roomId) {
          navigate(getInboxInvitesPath());
          return;
        }
        openTargetRef.current(target);
      }),
      onDesktopEvent<DndMode>(DesktopEvent.Dnd, (mode) => {
        setDndUntil(dndUntilFromMode(mode));
      }),
      onDesktopEvent<null>(DesktopEvent.OpenSettings, () => {
        setSettingsModal({ page: NOTIFICATION_SETTINGS_PAGE });
      }),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()).catch(() => undefined));
    };
  }, [setDndUntil, setSettingsModal, navigate]);

  return null;
}

export function DesktopIntegration() {
  if (!isNativeApp()) return null;
  return (
    <>
      <DesktopUnreadBadge />
      <DesktopDndSync />
      <DesktopEventBridge />
    </>
  );
}
