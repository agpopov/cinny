import { Editor, Element, Range, Transforms } from 'slate';
import { HistoryEditor } from 'slate-history';
import type { LinkElement } from './slate';
import { BlockType } from './types';
import { sanitizeText, urlSchemes } from '../../utils/sanitize';

export const getLinkHref = (value: string): string | undefined => {
  const href = value.trim();
  if (!href || /\s/.test(href)) return undefined;
  try {
    const url = new URL(href);
    return urlSchemes.includes(url.protocol.slice(0, -1)) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const isLink = (node: unknown): node is LinkElement =>
  Element.isElement(node) && node.type === BlockType.Link;

export const getSelectedLink = (editor: Editor) =>
  editor.selection ? Editor.above<LinkElement>(editor, { match: isLink }) : undefined;

export const canSetLink = (editor: Editor): boolean => {
  if (!editor.selection) return false;
  const [unsupported] = Editor.nodes(editor, {
    match: (node) =>
      Element.isElement(node) &&
      (editor.isVoid(node) ||
        node.type === BlockType.CodeBlock ||
        node.type === BlockType.CodeLine),
  });
  return !unsupported;
};

export const removeLink = (editor: Editor): void => {
  Transforms.unwrapNodes(editor, { match: isLink });
};

export const setLink = (editor: Editor, value: string, text?: string): boolean => {
  const href = getLinkHref(value);
  if (!href || !editor.selection || !canSetLink(editor)) return false;

  HistoryEditor.withNewBatch(editor, () => {
    Editor.withoutNormalizing(editor, () => {
      if (!editor.selection) return;
      const current = getSelectedLink(editor);
      if (Range.isCollapsed(editor.selection) && current && text === undefined) {
        Transforms.setNodes<LinkElement>(editor, { href }, { at: current[1] });
        return;
      }

      if (Range.isCollapsed(editor.selection) && current) {
        Transforms.select(editor, Editor.range(editor, current[1]));
      }

      // Split existing links at the selection so retargeting part of a link keeps
      // the unselected text and never produces nested anchors.
      const rangeRef = Editor.rangeRef(editor, editor.selection, { affinity: 'inward' });
      const [start, end] = Range.edges(editor.selection);
      Transforms.splitNodes(editor, { at: end, match: isLink });
      Transforms.splitNodes(editor, { at: start, match: isLink });
      const range = rangeRef.unref();
      if (!range) return;
      Transforms.select(editor, range);
      Transforms.unwrapNodes(editor, { match: isLink, split: true });
      if (!editor.selection) return;
      const selectedText = Editor.string(editor, editor.selection);
      if (Range.isCollapsed(editor.selection) || (text !== undefined && text !== selectedText)) {
        Transforms.insertNodes(editor, {
          type: BlockType.Link,
          href,
          children: [{ ...Editor.marks(editor), text: text || href }],
        });
      } else {
        Transforms.wrapNodes(editor, { type: BlockType.Link, href, children: [] }, { split: true });
      }
      Transforms.collapse(editor, { edge: 'end' });
    });

    // Continue typing outside the link rather than extending its label.
    const link = getSelectedLink(editor);
    if (link && editor.selection && Editor.isEnd(editor, editor.selection.focus, link[1])) {
      const after = Editor.after(editor, link[1]);
      if (after) Transforms.select(editor, after);
    }
  });
  return true;
};

export const pasteLink = (editor: Editor, text: string): boolean => {
  if (!editor.selection || Range.isCollapsed(editor.selection)) return false;
  return setLink(editor, text);
};

export const linkToHtml = (href: string, children: string): string => {
  const safeHref = getLinkHref(href);
  return safeHref ? `<a href="${sanitizeText(safeHref)}">${children}</a>` : children;
};

export const linkToPlainText = (href: string, children: string): string => `[${children}](${href})`;
