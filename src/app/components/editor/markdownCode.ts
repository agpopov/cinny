/* eslint-disable no-param-reassign */
import { Descendant, Text } from 'slate';
import {
  GroupMentionMap,
  groupMentionKey,
  getResolvedGroup,
  groupMentionText,
} from '../../utils/mentionGroups';

type CodeState = { fence?: string; ticks: number };
export function advanceMarkdownCode(text: string, state: CodeState): void {
  const fence = text.match(/^ {0,3}(`{3,}|~{3,})/);
  if (state.fence) {
    if (
      fence &&
      fence[1][0] === state.fence[0] &&
      fence[1].length >= state.fence.length &&
      text.slice(fence[0].length).trim() === ''
    )
      state.fence = undefined;
    return;
  }
  if (fence && !state.ticks) {
    [, state.fence] = fence;
    return;
  }
  const tokens = /(`+)/g;
  let match = tokens.exec(text);
  while (match) {
    const preceding = text.slice(0, match.index).match(/\\+$/)?.[0].length ?? 0;
    if (preceding % 2 === 0) {
      if (state.ticks === match[1].length) state.ticks = 0;
      else if (!state.ticks) state.ticks = match[1].length;
    }
    match = tokens.exec(text);
  }
}

// A mention selected before surrounding backticks were typed must become code,
// exactly as a textual mention would. Otherwise HTML pills split Markdown runs
// and can accidentally notify users from what looks like a code sample.
export function mentionsOutsideMarkdownCode(
  nodes: Descendant[],
  groups?: GroupMentionMap
): Descendant[] {
  const state: CodeState = { ticks: 0 };
  const visit = (node: Descendant): Descendant => {
    if (Text.isText(node)) {
      advanceMarkdownCode(node.text, state);
      return node;
    }
    if (node.type === 'code-block') return node;
    if (node.type === 'mention' && (state.fence || state.ticks)) {
      return {
        text: node.group
          ? groupMentionText(
              node.group.members !== undefined || groups?.has(groupMentionKey(node.group))
                ? getResolvedGroup(node.group, groups)
                : node.group
            )
          : node.id,
      };
    }
    return { ...node, children: node.children.map(visit) } as Descendant;
  };
  return nodes.map(visit);
}
