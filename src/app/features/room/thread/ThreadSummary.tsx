import React, { MouseEventHandler } from 'react';
import { Avatar, Box, Icon, Icons, Text } from 'folds';
import { Room, Thread } from 'matrix-js-sdk';
import classNames from 'classnames';
import * as css from './Thread.css';
import {
  formatRelativeTime,
  formatReplyCount,
  getThreadLastReply,
  getThreadUnread,
  useThreadVersion,
} from './useThread';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { UserAvatar } from '../../../components/user-avatar';
import { getMemberAvatarMxc } from '../../../utils/room';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';

type ThreadSummaryProps = {
  room: Room;
  thread: Thread;
  onOpen: () => void;
};

/** Плашка под корневым сообщением: «N ответов · последний ответ · когда». */
export function ThreadSummary({ room, thread, onOpen }: ThreadSummaryProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  useThreadVersion(room, thread);

  const count = thread.length;
  if (count === 0) return null;

  const lastReply = getThreadLastReply(room, thread);
  const unread = getThreadUnread(mx, room, thread);
  const avatarMxc = lastReply ? getMemberAvatarMxc(room, lastReply.senderId) : undefined;
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 48, 48, 'crop') ?? undefined
    : undefined;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    onOpen();
  };

  return (
    <Box
      as="button"
      type="button"
      className={css.Summary}
      alignItems="Center"
      gap="200"
      onClick={handleClick}
      aria-label={`Открыть тред: ${formatReplyCount(count)}`}
    >
      <Icon size="100" src={unread.unread ? Icons.ThreadUnread : Icons.Thread} />
      <Text as="span" size="T300" className={css.SummaryCount}>
        <b>{formatReplyCount(count)}</b>
      </Text>
      {lastReply && (
        <Box className={css.SummaryPreview} alignItems="Center" gap="100" grow="Yes">
          <Avatar size="200" radii="Pill">
            <UserAvatar
              userId={lastReply.senderId}
              src={avatarUrl}
              alt={lastReply.senderName}
              renderFallback={() => <Text size="L400">{nameInitials(lastReply.senderName)}</Text>}
            />
          </Avatar>
          <Text as="span" size="T300" truncate>
            <b>{lastReply.senderName}</b>: {lastReply.text}
          </Text>
          <Text as="span" size="T200" priority="300" style={{ flexShrink: 0 }}>
            · {formatRelativeTime(lastReply.ts)}
          </Text>
        </Box>
      )}
      {unread.unread && (
        <span
          className={classNames(css.UnreadDot, {
            [css.UnreadDotHighlight]: unread.highlight,
          })}
        />
      )}
      <Icon size="50" src={Icons.ChevronRight} />
    </Box>
  );
}
