import { Descendant, Text } from 'slate';
import { CodeRule } from '../../plugins/markdown/inline/rules';
import { CodeBlockRule } from '../../plugins/markdown/block/rules';
import {
  GroupMentionMap,
  groupMentionKey,
  getResolvedGroup,
  groupMentionText,
} from '../../utils/mentionGroups';

// Use the same rules as the serializer. Unclosed backticks, escaped delimiters
// and unsupported fences must keep their normal mention behavior.
export function mentionsOutsideMarkdownCode(
  nodes: Descendant[],
  groups?: GroupMentionMap
): Descendant[] {
  const inCode = new Set<Descendant>();
  const inspect = (items: Descendant[], block: boolean) => {
    let source = '';
    const mentions: { node: Descendant; offset: number }[] = [];
    const append = (node: Descendant) => {
      if (Text.isText(node)) source += node.text;
      else if (node.type === 'mention') {
        mentions.push({ node, offset: source.length });
        source += '\ufffc';
      } else node.children.forEach(append);
    };
    items.forEach((node, index) => {
      if (index && block) source += '\n';
      append(node);
    });
    const protect = (start: number, end: number) => {
      mentions.forEach(({ node, offset }) => {
        if (offset >= start && offset < end) inCode.add(node);
      });
    };
    const inline = (text: string, start: number) => {
      let offset = 0;
      let match = CodeRule.match(text);
      while (match) {
        const index = match.index ?? 0;
        protect(start + offset + index, start + offset + index + match[0].length);
        offset += index + match[0].length;
        match = CodeRule.match(text.slice(offset));
      }
    };
    let offset = 0;
    let match = block ? CodeBlockRule.match(source) : null;
    while (match) {
      const index = match.index ?? 0;
      inline(source.slice(offset, offset + index), offset);
      protect(offset + index, offset + index + match[0].length);
      offset += index + match[0].length;
      match = CodeBlockRule.match(source.slice(offset));
    }
    inline(source.slice(offset), offset);
  };
  const scan = (items: Descendant[]) => {
    let paragraphs: Descendant[] = [];
    const flush = () => {
      if (paragraphs.length) inspect(paragraphs, true);
      paragraphs = [];
    };
    items.forEach((node) => {
      if (!Text.isText(node) && node.type === 'paragraph') paragraphs.push(node);
      else {
        flush();
        if (!Text.isText(node) && node.type !== 'code-block') {
          inspect(node.children, false);
          scan(node.children);
        }
      }
    });
    flush();
  };
  scan(nodes);
  const visit = (node: Descendant): Descendant => {
    if (Text.isText(node) || node.type === 'code-block') return node;
    if (node.type === 'mention' && inCode.has(node)) {
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
