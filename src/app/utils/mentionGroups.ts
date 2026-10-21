/* eslint-disable no-control-regex */
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { Descendant, Text } from 'slate';

export const MENTION_GROUP_EVENT = 'in.cinny.mention_group';
export const GROUP_MENTION_ATTRIBUTE = 'data-cinny-mention-group';
export const createMentionGroupId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
export type MentionGroup = {
  id: string;
  spaceId: string;
  name: string;
  color: string;
  userIds: string[];
};
export type GroupMention = Omit<MentionGroup, 'userIds'> & {
  // Absent in a newly selected pill. Present (including []) in a sent message.
  members?: { id: string; name: string }[];
};
export type ResolvedGroupMention = GroupMention & { members: { id: string; name: string }[] };
export type GroupMentionMap = Map<string, ResolvedGroupMention>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isUser = (value: unknown): value is string =>
  typeof value === 'string' && /^@[^:\s]+:[^\s]+$/.test(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 255 &&
  !/[\s\u0000-\u001f]/.test(value);
export const normalizeGroupName = (name: string): string => name.trim().normalize('NFC');
export const groupNameKey = (name: string): string => normalizeGroupName(name).toLowerCase();
export const validGroupName = (name: unknown): name is string =>
  typeof name === 'string' &&
  normalizeGroupName(name) === name &&
  name.length > 0 &&
  name.length <= 100 &&
  !/[@\u0000-\u001f\u007f]/.test(name) &&
  groupNameKey(name) !== 'room';
const groupColor = (value: unknown): string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '#5865f2';
export const groupMentionKey = (group: Pick<MentionGroup, 'id' | 'spaceId'>): string =>
  JSON.stringify([group.spaceId, group.id]);

export function parseMentionGroup(
  spaceId: string,
  id: string,
  content: unknown
): MentionGroup | undefined {
  if (
    !isId(id) ||
    id.startsWith('@') ||
    !isObject(content) ||
    !validGroupName(content.name) ||
    !Array.isArray(content.user_ids) ||
    !content.user_ids.every(isUser)
  )
    return undefined;
  return {
    id,
    spaceId,
    name: content.name,
    color: groupColor(content.color),
    userIds: [...new Set(content.user_ids)],
  };
}

export const getSpaceMentionGroups = (space: Room): MentionGroup[] =>
  space.currentState
    .getStateEvents(MENTION_GROUP_EVENT)
    .flatMap((event) => {
      const group = parseMentionGroup(space.roomId, event.getStateKey() ?? '', event.getContent());
      return group ? [group] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

export function getRoomMentionGroups(mx: MatrixClient, roomId: string): MentionGroup[] {
  const contains = (space: Room, visited: Set<string>): boolean => {
    if (visited.has(space.roomId)) return false;
    visited.add(space.roomId);
    return space.currentState.getStateEvents('m.space.child').some((event) => {
      if (!Array.isArray(event.getContent().via)) return false;
      const childId = event.getStateKey();
      if (childId === roomId) return true;
      const child = childId ? mx.getRoom(childId) : undefined;
      return !!child?.isSpaceRoom() && contains(child, visited);
    });
  };
  return mx
    .getRooms()
    .filter(
      (space) =>
        space.isSpaceRoom() && space.getMyMembership() === 'join' && contains(space, new Set())
    )
    .flatMap(getSpaceMentionGroups);
}

export function collectGroupMentions(nodes: Descendant[]): GroupMention[] {
  const groups: GroupMention[] = [];
  const visit = (node: Descendant) => {
    if (Text.isText(node) || node.type === 'code-block') return;
    if (node.type === 'mention' && node.group) {
      groups.push(node.group);
      return;
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return groups;
}

// A new message resolves current membership, even when its pill was copied.
export function freshGroupMentionNodes(nodes: Descendant[]): Descendant[] {
  return nodes.map((node): Descendant => {
    if (Text.isText(node)) return node;
    if (node.type === 'mention' && node.group) {
      const { id, spaceId, name, color } = node.group;
      return { ...node, group: { id, spaceId, name, color } };
    }
    return { ...node, children: freshGroupMentionNodes(node.children) } as Descendant;
  });
}

export async function resolveGroupMentions(
  mx: MatrixClient,
  room: Room,
  nodes: Descendant[]
): Promise<GroupMentionMap> {
  const mentions = collectGroupMentions(nodes);
  const result: GroupMentionMap = new Map();
  if (mentions.some((group) => group.members === undefined)) await room.loadMembersIfNeeded();
  const spaces = [
    ...new Set(
      mentions.filter((group) => group.members === undefined).map((group) => group.spaceId)
    ),
  ];
  await Promise.all(
    spaces.map(async (spaceId) => {
      const space = mx.getRoom(spaceId);
      if (
        !space ||
        space.getMyMembership() !== 'join' ||
        !getRoomMentionGroups(mx, room.roomId).some((g) => g.spaceId === spaceId)
      ) {
        throw new Error(
          'Пространство группы больше недоступно. Удалите упоминание и выберите группу снова.'
        );
      }
      await space.loadMembersIfNeeded();
    })
  );
  mentions.forEach((mention) => {
    if (mention.members === undefined) {
      const space = mx.getRoom(mention.spaceId)!;
      const group = getSpaceMentionGroups(space).find((g) => g.id === mention.id);
      if (!group)
        throw new Error(`Группа «${mention.name}» удалена. Удалите её упоминание перед отправкой.`);
      const members = group.userIds
        .filter(
          (id) =>
            room.getMember(id)?.membership === 'join' && space.getMember(id)?.membership === 'join'
        )
        .map((id) => ({ id, name: room.getMember(id)?.rawDisplayName || id }));
      result.set(groupMentionKey(mention), {
        id: group.id,
        spaceId: group.spaceId,
        name: group.name,
        color: group.color,
        members,
      });
    }
  });
  return result;
}

export const getResolvedGroup = (
  group: GroupMention,
  resolved?: GroupMentionMap
): ResolvedGroupMention => {
  // An existing pill must retain its own snapshot even if a second, newly inserted
  // mention of this group resolves to a different membership in the same edit.
  if (group.members !== undefined) return group as ResolvedGroupMention;
  const value = resolved?.get(groupMentionKey(group));
  if (!value) throw new Error('Не удалось определить участников группы. Повторите отправку.');
  return value;
};

export function decodeGroupMention(value: string | undefined): ResolvedGroupMention | undefined {
  if (!value || value.length > 100000) return undefined;
  try {
    const data: unknown = JSON.parse(decodeURIComponent(value));
    if (
      !isObject(data) ||
      !isId(data.id) ||
      !isId(data.spaceId) ||
      !data.spaceId.startsWith('!') ||
      !validGroupName(data.name) ||
      !Array.isArray(data.members) ||
      data.members.length > 2000 ||
      !data.members.every(
        (member) =>
          isObject(member) &&
          isUser(member.id) &&
          typeof member.name === 'string' &&
          member.name.length <= 1000
      )
    )
      return undefined;
    return {
      id: data.id,
      spaceId: data.spaceId,
      name: data.name,
      color: groupColor(data.color),
      members: data.members as ResolvedGroupMention['members'],
    };
  } catch {
    return undefined;
  }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
export const groupMentionText = (group: GroupMention, displayNames = false): string => {
  const members = group.members ?? [];
  return `@${group.name}${
    members.length
      ? ` (${members
          .map((m) => (displayNames ? `@${m.name.replace(/^@/, '')}` : m.id))
          .join(', ')})`
      : ''
  }`;
};
export function groupMentionHtml(group: ResolvedGroupMention): string {
  const members = group.members
    .map(
      (member) =>
        `<a href="https://matrix.to/#/${encodeURIComponent(member.id)}">${escapeHtml(
          `@${member.name.replace(/^@/, '')}`
        )}</a>`
    )
    .join(', ');
  return `<span ${GROUP_MENTION_ATTRIBUTE}="${escapeHtml(
    encodeURIComponent(JSON.stringify(group))
  )}">${escapeHtml(`@${group.name}`)}${members ? ` (${members})` : ''}</span>`;
}

export function assertMentionContentSize(content: unknown, encrypted = false): void {
  if (new TextEncoder().encode(JSON.stringify(content)).length > (encrypted ? 44000 : 55000)) {
    throw new Error(
      'Сообщение с упоминаниями слишком большое. Сократите текст или число упоминаемых групп.'
    );
  }
}
