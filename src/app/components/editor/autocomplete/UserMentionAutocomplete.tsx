/* eslint-disable no-nested-ternary */
import React, { useEffect, useLayoutEffect, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Editor } from 'slate';
import { ReactEditor } from 'slate-react';
import { Avatar, Icon, Icons, MenuItem, Text } from 'folds';
import { MatrixClient, Room, RoomMember } from 'matrix-js-sdk';
import { useMentionGroups } from '../../../hooks/useMentionGroups';
import { MentionGroup, groupNameKey } from '../../../utils/mentionGroups';

import { AutocompleteQuery } from './autocompleteQuery';
import { AutocompleteMenu } from './AutocompleteMenu';
import { useRoomMembers } from '../../../hooks/useRoomMembers';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  SearchItemStrGetter,
  UseAsyncSearchOptions,
  useAsyncSearch,
} from '../../../hooks/useAsyncSearch';
import { normalize } from '../../../utils/AsyncSearch';
import { onTabPress } from '../../../utils/keyboard';
import { createMentionElement, moveCursor, replaceWithElement } from '../utils';
import { getMxIdLocalPart, getMxIdServer, isUserId } from '../../../utils/matrix';
import { getMemberDisplayName, getMemberSearchStr } from '../../../utils/room';
import { UserAvatar } from '../../user-avatar';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { Membership } from '../../../../types/matrix/room';

type MentionAutoCompleteHandler = (userId: string, name: string) => void;

const userIdFromQueryText = (mx: MatrixClient, text: string) =>
  isUserId(`@${text}`)
    ? `@${text}`
    : `@${text}${text.endsWith(':') ? '' : ':'}${getMxIdServer(mx.getUserId() ?? '')}`;

function UnknownMentionItem({
  userId,
  name,
  handleAutocomplete,
}: {
  userId: string;
  name: string;
  handleAutocomplete: MentionAutoCompleteHandler;
}) {
  return (
    <MenuItem
      as="button"
      radii="300"
      onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
        onTabPress(evt, () => handleAutocomplete(userId, name))
      }
      onClick={() => handleAutocomplete(userId, name)}
      before={
        <Avatar size="200">
          <UserAvatar
            userId={userId}
            renderFallback={() => <Icon size="50" src={Icons.User} filled />}
          />
        </Avatar>
      }
    >
      <Text style={{ flexGrow: 1 }} size="B400">
        {name}
      </Text>
    </MenuItem>
  );
}

type UserMentionAutocompleteProps = {
  room: Room;
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

const withAllowedMembership = (member: RoomMember): boolean =>
  member.membership === Membership.Join ||
  member.membership === Membership.Invite ||
  member.membership === Membership.Knock;

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};

const mxIdToName = (mxId: string) => getMxIdLocalPart(mxId) ?? mxId;
const getRoomMemberStr: SearchItemStrGetter<RoomMember> = (m, query) =>
  getMemberSearchStr(m, query, mxIdToName);

export function UserMentionAutocomplete({
  room,
  editor,
  query,
  requestClose,
}: UserMentionAutocompleteProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const roomId: string = room.roomId!;
  const roomAliasOrId = room.getCanonicalAlias() || roomId;
  const members = useRoomMembers(mx, roomId);
  const groups = useMentionGroups(mx, room)
    .filter((group) => groupNameKey(group.name).includes(groupNameKey(query.text)))
    .slice(0, 20);
  const handleGroupAutocomplete = (group: MentionGroup) => {
    const mentionEl = {
      ...createMentionElement(
        group.id,
        `@${group.name}`,
        group.userIds.includes(mx.getSafeUserId())
      ),
      group: { id: group.id, spaceId: group.spaceId, name: group.name, color: group.color },
    };
    replaceWithElement(editor, query.range, mentionEl);
    moveCursor(editor, true);
    requestClose();
  };

  const [result, search, resetSearch] = useAsyncSearch(members, getRoomMemberStr, SEARCH_OPTIONS);
  const autoCompleteMembers = (
    query.text
      ? result?.query === normalize(query.text)
        ? result.items.slice(0, 20)
        : []
      : members.slice(0, 20)
  ).filter(withAllowedMembership);

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const searchPending = !!query.text && result?.query !== normalize(query.text);

  const handleAutocomplete: MentionAutoCompleteHandler = (uId, name) => {
    const mentionEl = createMentionElement(
      uId,
      name.startsWith('@') ? name : `@${name}`,
      mx.getUserId() === uId || roomAliasOrId === uId
    );
    replaceWithElement(editor, query.range, mentionEl);
    moveCursor(editor, true);
    requestClose();
  };

  useLayoutEffect(() => {
    const handle = (evt: KeyboardEvent) => {
      if (
        evt.isComposing ||
        evt.shiftKey ||
        evt.ctrlKey ||
        evt.metaKey ||
        evt.altKey ||
        !['Enter', 'Tab'].includes(evt.key)
      )
        return;
      const { target } = evt;
      if (!(target instanceof Node) || !ReactEditor.toDOMNode(editor, editor).contains(target))
        return;
      if (evt.key === 'Enter' && query.text === '') return;
      if (searchPending && !groups.length && query.text !== 'room') {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      if (
        evt.key === 'Enter' &&
        !groups.length &&
        !autoCompleteMembers.length &&
        query.text !== 'room'
      )
        return;
      evt.preventDefault();
      evt.stopPropagation();
      if (query.text === 'room') {
        handleAutocomplete(roomAliasOrId, '@room');
        return;
      }
      if (groups.length) {
        handleGroupAutocomplete(groups[0]);
        return;
      }
      if (autoCompleteMembers.length) {
        const member = autoCompleteMembers[0];
        handleAutocomplete(member.userId, member.name);
        return;
      }
      if (!/\s|@/.test(query.text)) {
        const userId = userIdFromQueryText(mx, query.text);
        handleAutocomplete(userId, userId);
      }
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  });

  const getName = (member: RoomMember) =>
    getMemberDisplayName(room, member.userId) ?? getMxIdLocalPart(member.userId) ?? member.userId;

  return (
    <AutocompleteMenu headerContent={<Text size="L400">Mentions</Text>} requestClose={requestClose}>
      {groups.map((group) => (
        <MenuItem
          key={`${group.spaceId}/${group.id}`}
          as="button"
          radii="300"
          onMouseDown={(evt) => evt.preventDefault()}
          onClick={() => handleGroupAutocomplete(group)}
          onKeyDown={(evt) => onTabPress(evt, () => handleGroupAutocomplete(group))}
          before={<Icon src={Icons.User} size="100" />}
          after={
            <Text size="T200" priority="300" truncate>
              {mx.getRoom(group.spaceId)?.name} · {group.userIds.length}
            </Text>
          }
        >
          <Text size="B400" style={{ color: group.color }} truncate>{`@${group.name}`}</Text>
        </MenuItem>
      ))}
      {query.text === 'room' && (
        <UnknownMentionItem
          userId={roomAliasOrId}
          name="@room"
          handleAutocomplete={handleAutocomplete}
        />
      )}
      {autoCompleteMembers.length === 0 ? (
        groups.length || /\s|@/.test(query.text) ? null : (
          <UnknownMentionItem
            userId={userIdFromQueryText(mx, query.text)}
            name={userIdFromQueryText(mx, query.text)}
            handleAutocomplete={handleAutocomplete}
          />
        )
      ) : (
        autoCompleteMembers.map((roomMember) => {
          const avatarMxcUrl = roomMember.getMxcAvatarUrl();
          const avatarUrl = avatarMxcUrl
            ? mx.mxcUrlToHttp(avatarMxcUrl, 32, 32, 'crop', undefined, false, useAuthentication)
            : undefined;
          return (
            <MenuItem
              key={roomMember.userId}
              data-mention-user={roomMember.userId}
              as="button"
              radii="300"
              onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
                onTabPress(evt, () => handleAutocomplete(roomMember.userId, getName(roomMember)))
              }
              onClick={() => handleAutocomplete(roomMember.userId, getName(roomMember))}
              after={
                <Text size="T200" priority="300" truncate>
                  {roomMember.userId}
                </Text>
              }
              before={
                <Avatar size="200">
                  <UserAvatar
                    userId={roomMember.userId}
                    src={avatarUrl ?? undefined}
                    alt={getName(roomMember)}
                    renderFallback={() => <Icon size="50" src={Icons.User} filled />}
                  />
                </Avatar>
              }
            >
              <Text style={{ flexGrow: 1 }} size="B400" truncate>
                {getName(roomMember)}
              </Text>
            </MenuItem>
          );
        })
      )}
    </AutocompleteMenu>
  );
}
