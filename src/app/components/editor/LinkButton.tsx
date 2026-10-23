import { t } from 'i18next';
import React, { FormEventHandler, useEffect, useId, useState } from 'react';
import { Editor, type RangeRef, Transforms } from 'slate';
import { ReactEditor, useReadOnly, useSlate } from 'slate-react';
import { Box, Button, Header, Icon, IconButton, Icons, Input, Text, config } from 'folds';
import { Modal500 } from '../Modal500';
import { canSetLink, getLinkHref, getSelectedLink, removeLink, setLink } from './links';

type LinkFormProps = {
  editor: Editor;
  selection: RangeRef;
  requestClose: () => void;
};

function LinkForm({ editor, selection, requestClose }: LinkFormProps) {
  const [existing] = useState(() => getSelectedLink(editor));
  const [href, setHref] = useState(existing?.[0].href ?? '');
  const [text, setText] = useState(
    selection.current ? Editor.string(editor, selection.current) : ''
  );
  const [invalid, setInvalid] = useState(false);
  const id = useId();

  const restoreSelection = () => {
    if (!selection.current) return false;
    Transforms.select(editor, selection.current);
    return true;
  };

  const handleSubmit: FormEventHandler = (evt) => {
    evt.preventDefault();
    if (!getLinkHref(href)) {
      setInvalid(true);
      return;
    }
    if (restoreSelection()) setLink(editor, href, text || undefined);
    requestClose();
  };

  return (
    <Modal500
      requestClose={() => {
        restoreSelection();
        requestClose();
      }}
    >
      <Header size="500" style={{ padding: config.space.S400 }}>
        <Box grow="Yes">
          <Text size="H4">{t('Link')}</Text>
        </Box>
        <IconButton
          size="300"
          aria-label="Закрыть редактор ссылки"
          onClick={() => {
            restoreSelection();
            requestClose();
          }}
        >
          <Icon size="100" src={Icons.Cross} />
        </IconButton>
      </Header>
      <Box
        as="form"
        onSubmit={handleSubmit}
        direction="Column"
        gap="400"
        style={{ padding: config.space.S400, paddingTop: 0 }}
      >
        <Box direction="Column" gap="100">
          <Text as="label" size="L400" htmlFor={`${id}-text`}>
            {t('Text')}
          </Text>
          <Input
            id={`${id}-text`}
            value={text}
            placeholder={t('Link text')}
            onChange={(evt) => setText(evt.currentTarget.value)}
          />
        </Box>
        <Box direction="Column" gap="100">
          <Text as="label" size="L400" htmlFor={`${id}-url`}>
            URL
          </Text>
          <Input
            id={`${id}-url`}
            autoFocus
            value={href}
            placeholder="https://example.org"
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(evt) => {
              setHref(evt.currentTarget.value);
              setInvalid(false);
            }}
            required
          />
          {invalid && (
            <Text id={`${id}-error`} size="T200" role="alert">
              {t('Enter a valid URL, such as https://example.org.')}
            </Text>
          )}
        </Box>
        <Box gap="200" justifyContent="SpaceBetween">
          {existing && (
            <Button
              type="button"
              variant="Secondary"
              onClick={() => {
                if (restoreSelection()) removeLink(editor);
                requestClose();
              }}
            >
              <Text size="B400">{t('Remove link')}</Text>
            </Button>
          )}
          <Button type="submit" variant="Primary">
            <Text size="B400">{existing ? t('Save') : t('Insert')}</Text>
          </Button>
        </Box>
      </Box>
    </Modal500>
  );
}

export function LinkButton() {
  const editor = useSlate();
  const readOnly = useReadOnly();
  const [selection, setSelection] = useState<RangeRef>();
  const link = getSelectedLink(editor);

  useEffect(
    () => () => {
      selection?.unref();
    },
    [selection]
  );

  const handleClose = () => {
    selection?.unref();
    setSelection(undefined);
    // Let the modal restore focus before returning it to the editor's caret.
    requestAnimationFrame(() => ReactEditor.focus(editor));
  };

  return (
    <>
      <IconButton
        variant="SurfaceVariant"
        aria-label="Ссылка"
        title={link ? t('Edit link') : t('Insert link')}
        aria-pressed={!!link}
        size="400"
        radii="300"
        disabled={readOnly || (!!editor.selection && !canSetLink(editor))}
        onMouseDown={(evt) => evt.preventDefault()}
        onClick={() => {
          if (!editor.selection) Transforms.select(editor, Editor.end(editor, []));
          if (!editor.selection) return;
          const range = link ? Editor.range(editor, link[1]) : editor.selection;
          setSelection(Editor.rangeRef(editor, range));
        }}
      >
        <Icon size="200" src={Icons.Link} />
      </IconButton>
      {selection && <LinkForm editor={editor} selection={selection} requestClose={handleClose} />}
    </>
  );
}
