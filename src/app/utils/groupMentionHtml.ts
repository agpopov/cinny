// Early exits keep validation fail-closed.
/* eslint-disable no-restricted-syntax */
import { Element, isTag, isText } from 'domhandler';
import { decodeGroupMention, GROUP_MENTION_ATTRIBUTE, groupMentionText } from './mentionGroups';
import { parseMatrixToUser } from '../plugins/matrix-to';
import { tryDecodeURIComponent } from './dom';

// Only collapse our exact fallback. A forged/malformed marker must never hide
// additional message text or turn unrelated links into invisible recipients.
export function readGroupMentionNode(node: Element) {
  if (node.name !== 'span') return undefined;
  const group = decodeGroupMention(node.attribs[GROUP_MENTION_ATTRIBUTE]);
  if (!group) return undefined;
  let text = '';
  const ids: string[] = [];
  for (const child of node.children) {
    if (isText(child)) text += child.data;
    else if (isTag(child) && child.name === 'a' && child.children.every(isText)) {
      const id = parseMatrixToUser(tryDecodeURIComponent(child.attribs.href));
      if (!id) return undefined;
      ids.push(id);
      text += child.children.map((c) => (isText(c) ? c.data : '')).join('');
    } else return undefined;
  }
  if (
    text !== groupMentionText(group, true) ||
    ids.length !== group.members.length ||
    ids.some((id, index) => id !== group.members[index].id)
  )
    return undefined;
  return group;
}
