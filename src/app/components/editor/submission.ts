import { type Descendant, Editor, Transforms } from 'slate';
import { isEmptyEditor, resetEditor, resetEditorHistory } from './utils';

/** Detach the submitted document before any asynchronous preparation or HTTP. */
export const takeEditorSubmission = (editor: Editor): Descendant[] => {
  const message = structuredClone(editor.children);
  resetEditor(editor);
  Transforms.select(editor, Editor.start(editor, []));
  resetEditorHistory(editor);
  // Slate normally defers onChange to a microtask. The caller uses flushSync so
  // native Linux input never targets DOM nodes belonging to the old document.
  editor.onChange();
  return message;
};

/** Never replace a new message with an earlier failed submission. */
export const restoreEditorSubmission = (editor: Editor, message: Descendant[]): boolean => {
  if (!isEmptyEditor(editor)) return false;
  Transforms.insertFragment(editor, structuredClone(message));
  Transforms.select(editor, Editor.end(editor, []));
  resetEditorHistory(editor);
  editor.onChange();
  return true;
};
