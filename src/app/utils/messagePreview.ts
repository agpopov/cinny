import parse from 'html-dom-parser';
import { isTag, isText, type ChildNode } from 'domhandler';
import { sanitizeCustomHtml } from './sanitize';
import { trimReplyFromBody } from './room';

const BLOCK = /^(p|div|h[1-6]|blockquote|pre|ul|ol|li|tr|table|details|summary)$/;

/** Readable notification text, without mounting HTML or loading external media. */
export const formattedMessageText = (html: string): string => {
  const read = (nodes: ChildNode[]): string =>
    nodes
      .map((node): string => {
        if (isText(node)) return node.data;
        if (!isTag(node)) return '';
        if ('data-mx-spoiler' in node.attribs) return '[Спойлер]';
        if (node.name === 'img') return node.attribs.alt || node.attribs.title || '🖼';
        if (node.name === 'br' || node.name === 'hr') return '\n';
        const text = read(node.children);
        if (node.name === 'td' || node.name === 'th') return `${text}\t`;
        if (node.name === 'li') return `• ${text}\n`;
        return BLOCK.test(node.name) ? `\n${text}\n` : text;
      })
      .join('');
  return read(parse(sanitizeCustomHtml(html)))
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** Match the channel renderer, including bots which omit the optional format field. */
export const getMessagePreviewText = (content: Record<string, unknown>): string =>
  typeof content.formatted_body === 'string'
    ? formattedMessageText(content.formatted_body)
    : trimReplyFromBody(typeof content.body === 'string' ? content.body : '');
