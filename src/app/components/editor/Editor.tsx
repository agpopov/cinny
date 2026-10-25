/* eslint-disable no-param-reassign */
import React, {
  ClipboardEventHandler,
  KeyboardEventHandler,
  ReactNode,
  forwardRef,
  useCallback,
  useState,
} from 'react';
import { Box, Scroll, Text } from 'folds';
import {
  Descendant,
  Editor,
  Element as SlateElement,
  Range,
  Transforms,
  createEditor,
} from 'slate';
import { flushSync } from 'react-dom';
import { IS_FIREFOX } from 'slate-dom';
import {
  Slate,
  ReactEditor,
  Editable,
  withReact,
  RenderLeafProps,
  RenderElementProps,
  RenderPlaceholderProps,
} from 'slate-react';
import { withHistory } from 'slate-history';
import { BlockType } from './types';
import { RenderElement, RenderLeaf } from './Elements';
import { CustomElement } from './slate';
import * as css from './Editor.css';
import { toggleKeyboardShortcut } from './keyboard';
import { pasteLink } from './links';

// Новый объект для каждого редактора: slate-react хранит пути узлов в глобальных
// WeakMap, и два одновременно открытых поля ввода (комната и тред) с общими
// узлами ломают друг друга («Unable to find the path for Slate node»).
const createInitialValue = (): CustomElement[] => [
  {
    type: BlockType.Paragraph,
    children: [{ text: '' }],
  },
];

const withInline = (editor: Editor): Editor => {
  const { isInline } = editor;

  editor.isInline = (element) =>
    [BlockType.Mention, BlockType.Emoticon, BlockType.Link, BlockType.Command].includes(
      element.type
    ) || isInline(element);

  return editor;
};

const withVoid = (editor: Editor): Editor => {
  const { isVoid } = editor;

  editor.isVoid = (element) =>
    [BlockType.Mention, BlockType.Emoticon, BlockType.Command].includes(element.type) ||
    isVoid(element);

  return editor;
};

export const useEditor = (): Editor => {
  const [editor] = useState(() => withInline(withVoid(withReact(withHistory(createEditor())))));
  return editor;
};

export type EditorChangeHandler = (value: Descendant[]) => void;
type CustomEditorProps = {
  editableName?: string;
  readOnly?: boolean;
  top?: ReactNode;
  bottom?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  maxHeight?: string;
  editor: Editor;
  placeholder?: string;
  onKeyDown?: KeyboardEventHandler;
  onKeyUp?: KeyboardEventHandler;
  onChange?: EditorChangeHandler;
  onPaste?: ClipboardEventHandler;
};
export const CustomEditor = forwardRef<HTMLDivElement, CustomEditorProps>(
  (
    {
      editableName,
      readOnly,
      top,
      bottom,
      before,
      after,
      maxHeight = '50vh',
      editor,
      placeholder,
      onKeyDown,
      onKeyUp,
      onChange,
      onPaste,
    },
    ref
  ) => {
    const [initialValue] = useState(createInitialValue);
    const handlePaste: ClipboardEventHandler = useCallback(
      (evt) => {
        if (readOnly) return;
        onPaste?.(evt);
        if (evt.defaultPrevented || evt.clipboardData.files.length > 0) return;
        if (pasteLink(editor, evt.clipboardData.getData('text/plain'))) evt.preventDefault();
      },
      [editor, onPaste, readOnly]
    );
    const renderElement = useCallback(
      (props: RenderElementProps) => <RenderElement {...props} />,
      []
    );

    const renderLeaf = useCallback((props: RenderLeafProps) => <RenderLeaf {...props} />, []);

    const handleKeydown: KeyboardEventHandler = useCallback(
      (evt) => {
        onKeyDown?.(evt);
        const shortcutToggled = toggleKeyboardShortcut(editor, evt);
        if (shortcutToggled) evt.preventDefault();
      },
      [editor, onKeyDown]
    );

    // Firefox replaces native DOM nodes during IME composition before React's
    // batched removal of selected pills or links. Commit that removal first so
    // React never tries to remove an inline node already detached by Firefox.
    const handleCompositionStart = useCallback(() => {
      if (!IS_FIREFOX || readOnly) return;
      const selection = window.getSelection();
      const range =
        selection &&
        ReactEditor.toSlateRange(editor, selection, { exactMatch: false, suppressThrow: true });
      if (!range || Range.isCollapsed(range)) return;
      const [inlineNode] = Editor.nodes(editor, {
        at: range,
        match: (node) =>
          SlateElement.isElement(node) && (editor.isVoid(node) || editor.isInline(node)),
      });
      if (!inlineNode) return;
      flushSync(() => {
        Transforms.select(editor, range);
        Editor.deleteFragment(editor);
        editor.onChange();
      });
    }, [editor, readOnly]);

    const renderPlaceholder = useCallback(
      ({ attributes, children }: RenderPlaceholderProps) => (
        <span
          {...attributes}
          style={{ ...attributes.style, opacity: 0.85 }}
          className={css.EditorPlaceholderContainer}
        >
          {/* Inner component to style the actual text position and appearance */}
          <Text as="span" className={css.EditorPlaceholderTextVisual} truncate>
            {children}
          </Text>
        </span>
      ),
      []
    );

    return (
      <div className={css.Editor} ref={ref}>
        <Slate editor={editor} initialValue={initialValue} onChange={onChange}>
          {top}
          <Box alignItems="Start">
            {before && (
              <Box className={css.EditorOptions} alignItems="Center" gap="100" shrink="No">
                {before}
              </Box>
            )}
            <Scroll
              className={css.EditorTextareaScroll}
              variant="SurfaceVariant"
              style={{ maxHeight }}
              size="300"
              visibility="Hover"
              hideTrack
            >
              <Editable
                aria-label={placeholder || 'Редактор сообщения'}
                readOnly={readOnly}
                onCompositionStart={handleCompositionStart}
                data-editable-name={editableName}
                className={css.EditorTextarea}
                placeholder={placeholder}
                renderPlaceholder={renderPlaceholder}
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                onKeyDown={handleKeydown}
                onKeyUp={onKeyUp}
                onPaste={handlePaste}
              />
            </Scroll>
            {after && (
              <Box className={css.EditorOptions} alignItems="Center" gap="100" shrink="No">
                {after}
              </Box>
            )}
          </Box>
          {bottom}
        </Slate>
      </div>
    );
  }
);
