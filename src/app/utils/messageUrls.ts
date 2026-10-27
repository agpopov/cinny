import parse from 'html-dom-parser';
import { isTag, isText, type ChildNode } from 'domhandler';
import { URL_REG } from './regex';
import { sanitizeCustomHtml } from './sanitize';
import { getHttpUrl } from './urlPreview';

/** Extract the links the message actually renders, rather than its Markdown fallback. */
export const getMessageUrls = (body: string, customBody?: string): string[] => {
  const urls = new Set<string>();
  const addUrl = (value: unknown) => {
    const url = getHttpUrl(value);
    if (url) urls.add(url);
  };
  const addText = (text: string) => text.match(URL_REG)?.forEach(addUrl);
  const read = (nodes: ChildNode[]) => {
    nodes.forEach((node) => {
      if (isText(node)) {
        addText(node.data);
        return;
      }
      if (!isTag(node)) return;
      if (['pre', 'code'].includes(node.name) || 'data-mx-spoiler' in node.attribs) return;
      if (node.name === 'a') {
        // The label may itself be another URL. Only preview the destination.
        addUrl(node.attribs.href);
        return;
      }
      read(node.children);
    });
  };
  if (customBody) read(parse(sanitizeCustomHtml(customBody)));
  else addText(body);
  return Array.from(urls);
};
