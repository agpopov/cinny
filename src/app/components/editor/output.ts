import { Descendant, Editor, Text } from 'slate';
import { MatrixClient } from 'matrix-js-sdk';
import { htmlToEditorInput } from './input';
import { mentionsOutsideMarkdownCode } from './markdownCode';
import { sanitizeText } from '../../utils/sanitize';
import { BlockType } from './types';
import { CustomElement } from './slate';
import {
  parseBlockMD,
  parseInlineMD,
  unescapeMarkdownBlockSequences,
  unescapeMarkdownInlineSequences,
} from '../../plugins/markdown';
import { findAndReplace } from '../../utils/findAndReplace';
import { sanitizeForRegex } from '../../utils/regex';
import { isUserId } from '../../utils/matrix';

import {
  GroupMentionMap,
  getResolvedGroup,
  groupMentionHtml,
  groupMentionText,
} from '../../utils/mentionGroups';

export type OutputOptions = {
  groupMentions?: GroupMentionMap;
  allowTextFormatting?: boolean;
  allowInlineMarkdown?: boolean;
  allowBlockMarkdown?: boolean;
};

const textToCustomHtml = (node: Text, opts: OutputOptions): string => {
  let string = sanitizeText(node.text);
  if (opts.allowTextFormatting) {
    if (node.bold) string = `<strong>${string}</strong>`;
    if (node.italic) string = `<i>${string}</i>`;
    if (node.underline) string = `<u>${string}</u>`;
    if (node.strikeThrough) string = `<s>${string}</s>`;
    if (node.code) string = `<code>${string}</code>`;
    if (node.spoiler) string = `<span data-mx-spoiler>${string}</span>`;
  }

  if (opts.allowInlineMarkdown && string === sanitizeText(node.text)) {
    string = parseInlineMD(string);
  }

  return string;
};

const elementToCustomHtml = (
  node: CustomElement,
  children: string,
  opts: OutputOptions
): string => {
  switch (node.type) {
    case BlockType.Paragraph:
      return `${children}<br/>`;
    case BlockType.Heading:
      return `<h${node.level}>${children}</h${node.level}>`;
    case BlockType.CodeLine:
      return `${children}\n`;
    case BlockType.CodeBlock:
      return `<pre><code>${children}</code></pre>`;
    case BlockType.QuoteLine:
      return `${children}<br/>`;
    case BlockType.BlockQuote:
      return `<blockquote>${children}</blockquote>`;
    case BlockType.ListItem:
      return `<li><p>${children}</p></li>`;
    case BlockType.OrderedList:
      return `<ol>${children}</ol>`;
    case BlockType.UnorderedList:
      return `<ul>${children}</ul>`;

    case BlockType.Mention: {
      if (node.group) return groupMentionHtml(getResolvedGroup(node.group, opts.groupMentions));
      let fragment = node.id;

      if (node.eventId) {
        fragment += `/${node.eventId}`;
      }
      if (node.viaServers && node.viaServers.length > 0) {
        fragment += `?${node.viaServers.map((server) => `via=${server}`).join('&')}`;
      }

      const matrixTo = `https://matrix.to/#/${fragment}`;
      return `<a href="${encodeURI(matrixTo)}">${sanitizeText(node.name)}</a>`;
    }
    case BlockType.Emoticon:
      return node.key.startsWith('mxc://')
        ? `<img data-mx-emoticon src="${node.key}" alt="${sanitizeText(
            node.shortcode
          )}" title="${sanitizeText(node.shortcode)}" height="32" />`
        : sanitizeText(node.key);
    case BlockType.Link:
      return `<a href="${encodeURI(node.href)}">${node.children}</a>`;
    case BlockType.Command:
      return `/${sanitizeText(node.command)}`;
    default:
      return children;
  }
};

const HTML_TAG_REG_G = /<([\w-]+)(?: [^>]*)?(?:(?:\/>)|(?:>.*?<\/\1>))/g;
const ignoreHTMLParseInlineMD = (text: string): string =>
  findAndReplace(
    text,
    HTML_TAG_REG_G,
    (match) => match[0],
    (txt) => parseInlineMD(txt)
  ).join('');

const serializeMatrixCustomHTML = (
  node: Descendant | Descendant[],
  opts: OutputOptions
): string => {
  let markdownLines = '';
  const parseNode = (n: Descendant, index: number, targetNodes: Descendant[]) => {
    if (opts.allowBlockMarkdown && 'type' in n && n.type === BlockType.Paragraph) {
      const line = serializeMatrixCustomHTML(n, {
        ...opts,
        allowInlineMarkdown: false,
        allowBlockMarkdown: false,
      })
        .replace(/<br\/>$/, '\n')
        .replace(/^(\\*)&gt;/, '$1>');

      markdownLines += line;
      if (index === targetNodes.length - 1) {
        return parseBlockMD(markdownLines, ignoreHTMLParseInlineMD);
      }
      return '';
    }

    const parsedMarkdown = parseBlockMD(markdownLines, ignoreHTMLParseInlineMD);
    markdownLines = '';
    const isCodeLine = 'type' in n && n.type === BlockType.CodeLine;
    if (isCodeLine)
      return `${parsedMarkdown}${serializeMatrixCustomHTML(n, {
        groupMentions: opts.groupMentions,
      })}`;

    return `${parsedMarkdown}${serializeMatrixCustomHTML(n, {
      ...opts,
      allowBlockMarkdown: false,
    })}`;
  };
  if (Array.isArray(node)) return node.map(parseNode).join('');
  if (Text.isText(node)) return textToCustomHtml(node, opts);

  const children = node.children.map(parseNode).join('');
  return elementToCustomHtml(node, children, opts);
};

export const toMatrixCustomHTML = (
  node: Descendant | Descendant[],
  opts: OutputOptions
): string => {
  const nodes = Array.isArray(node) ? node : [node];
  return serializeMatrixCustomHTML(
    opts.allowBlockMarkdown || opts.allowInlineMarkdown
      ? mentionsOutsideMarkdownCode(nodes, opts.groupMentions)
      : nodes,
    opts
  );
};

const elementToPlainText = (
  node: CustomElement,
  children: string,
  groups?: GroupMentionMap
): string => {
  switch (node.type) {
    case BlockType.Paragraph:
      return `${children}\n`;
    case BlockType.Heading:
      return `${children}\n`;
    case BlockType.CodeLine:
      return `${children}\n`;
    case BlockType.CodeBlock:
      return `${children}\n`;
    case BlockType.QuoteLine:
      return `| ${children}\n`;
    case BlockType.BlockQuote:
      return `${children}\n`;
    case BlockType.ListItem:
      return `- ${children}\n`;
    case BlockType.OrderedList:
      return `${children}\n`;
    case BlockType.UnorderedList:
      return `${children}\n`;
    case BlockType.Mention:
      return node.group
        ? groupMentionText(
            groups || node.group.members ? getResolvedGroup(node.group, groups) : node.group
          )
        : node.id;
    case BlockType.Emoticon:
      return node.key.startsWith('mxc://') ? `:${node.shortcode}:` : node.key;
    case BlockType.Link:
      return `[${node.children}](${node.href})`;
    case BlockType.Command:
      return `/${node.command}`;
    default:
      return children;
  }
};

const serializePlainText = (
  node: Descendant | Descendant[],
  isMarkdown: boolean,
  groups?: GroupMentionMap
): string => {
  if (Array.isArray(node))
    return node.map((n) => serializePlainText(n, isMarkdown, groups)).join('');
  if (Text.isText(node))
    return isMarkdown
      ? unescapeMarkdownBlockSequences(node.text, unescapeMarkdownInlineSequences)
      : node.text;

  const children = node.children.map((n) => serializePlainText(n, isMarkdown, groups)).join('');
  return elementToPlainText(node, children, groups);
};

export const toPlainText = (
  node: Descendant | Descendant[],
  isMarkdown: boolean,
  groups?: GroupMentionMap
): string => {
  const nodes = Array.isArray(node) ? node : [node];
  return serializePlainText(
    isMarkdown ? mentionsOutsideMarkdownCode(nodes, groups) : nodes,
    isMarkdown,
    groups
  );
};

/**
 * Check if customHtml is equals to plainText
 * by replacing `<br/>` with `/n` in customHtml
 * and sanitizing plainText before comparison
 * because text are sanitized in customHtml
 * @param customHtml string
 * @param plain string
 * @returns boolean
 */
export const customHtmlEqualsPlainText = (customHtml: string, plain: string): boolean =>
  customHtml.replace(/<br\/>/g, '\n') === sanitizeText(plain);

export const trimCustomHtml = (customHtml: string) => customHtml.replace(/<br\/>$/g, '').trim();

export const trimCommand = (cmdName: string, str: string) => {
  const cmdRegX = new RegExp(`^(\\s+)?(\\/${sanitizeForRegex(cmdName)})([^\\S\n]+)?`);

  const match = str.match(cmdRegX);
  if (!match) return str;
  return str.slice(match[0].length);
};

export type MentionsData = {
  room: boolean;
  users: Set<string>;
};
export const getMentions = (
  mx: MatrixClient,
  roomId: string,
  editor: Editor,
  groups?: GroupMentionMap,
  renderedHtml?: string
): MentionsData => {
  if (renderedHtml !== undefined) {
    return getMentions(mx, roomId, { ...editor, children: htmlToEditorInput(renderedHtml, false) });
  }
  const mentionData: MentionsData = {
    room: false,
    users: new Set(),
  };

  const parseMentions = (node: Descendant): void => {
    if (Text.isText(node)) return;
    if (node.type === BlockType.CodeBlock) return;

    if (node.type === BlockType.Mention) {
      if (node.group) {
        getResolvedGroup(node.group, groups).members.forEach((member) => {
          if (member.id !== mx.getUserId()) mentionData.users.add(member.id);
        });
        return;
      }
      if (
        node.name === '@room' &&
        !node.eventId &&
        (node.id === roomId || node.id === mx.getRoom(roomId)?.getCanonicalAlias())
      ) {
        mentionData.room = true;
      }

      if (isUserId(node.id) && node.id !== mx.getUserId()) {
        mentionData.users.add(node.id);
      }

      return;
    }

    node.children.forEach(parseMentions);
  };

  editor.children.forEach(parseMentions);

  return mentionData;
};
