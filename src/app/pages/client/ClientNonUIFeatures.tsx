import { useAtomValue } from 'jotai';
import React, { ReactNode, useEffect } from 'react';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import LogoSVG from '../../../../public/res/svg/cinny.svg';
import LogoUnreadSVG from '../../../../public/res/svg/cinny-unread.svg';
import LogoHighlightSVG from '../../../../public/res/svg/cinny-highlight.svg';
import { setFavicon } from '../../utils/dom';
import {
  DesktopIntegration,
  InviteNotifications,
  MessageNotifications,
} from './DesktopIntegration';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useNotificationOwner } from '../../hooks/useNotificationOwner';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSearchIndexSubscription } from '../../hooks/useLocalSearch';
import { MobileBackNavigation } from './MobileBackNavigation';

function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');

  if (twitterEmoji) {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji');
  } else {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji_DISABLED');
  }

  return null;
}

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }

  return null;
}

function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);

  useEffect(() => {
    const notification = roomToUnread.size > 0;
    let highlight = false;
    roomToUnread.forEach((unread) => {
      if (unread.highlight > 0) {
        highlight = true;
      }
    });

    if (notification) {
      setFavicon(highlight ? LogoHighlightSVG : LogoUnreadSVG);
    } else {
      setFavicon(LogoSVG);
    }
  }, [roomToUnread]);

  return null;
}

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  useSearchIndexSubscription();
  useNotificationOwner(useMatrixClient().getSafeUserId());
  return (
    <>
      <MobileBackNavigation />
      <SystemEmojiFeature />
      <PageZoomFeature />
      <FaviconUpdater />
      <InviteNotifications />
      <MessageNotifications />
      <DesktopIntegration />
      {children}
    </>
  );
}
