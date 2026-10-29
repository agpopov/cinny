import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Input, Scroll, Spinner, Text } from 'folds';
import { EventType, MsgType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { isKeyHotkey } from 'is-hotkey';
import {
  AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  AutocompleteQuery,
  CustomEditor,
  RoomMentionAutocomplete,
  Toolbar,
  UserMentionAutocomplete,
  customHtmlEqualsPlainText,
  getAutocompleteQuery,
  getMentions,
  getPrevWordRange,
  isEmptyEditor,
  resetEditor,
  toMatrixCustomHTML,
  toPlainText,
  trimCustomHtml,
  useEditor,
} from '../../../components/editor';
import { mentionsOutsideMarkdownCode } from '../../../components/editor/markdownCode';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { usePersistentDraft } from '../../../hooks/usePersistentDraft';
import { useComposingCheck } from '../../../hooks/useComposingCheck';
import { usePowerLevelsContext } from '../../../hooks/usePowerLevels';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { PrivateStorage, privateAccountKey } from '../../../utils/privateStorage';
import {
  THREAD_NAME_MAX_LENGTH,
  ThreadCreationState,
  getNewThreadDraftKey,
  getThreadCreationAttempt,
} from '../../../utils/threadCreation';
import {
  assertMentionContentSize,
  freshGroupMentionNodes,
  resolveGroupMentions,
} from '../../../utils/mentionGroups';
import { getMentionContent } from '../../../utils/room';
import * as css from './Thread.css';

const ignoreReply = () => undefined;

type NewThreadProps = {
  room: Room;
  onCreated: (rootId: string) => void;
  onCancel: () => void;
};

export function NewThread({ room, onCreated, onCancel }: NewThreadProps) {
  const mx = useMatrixClient();
  const editor = useEditor();
  const titleId = useId();
  const messageId = useId();
  const [title, setTitle] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const nameRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ThreadCreationState>();
  const [error, setError] = useState('');
  const [hasMessage, setHasMessage] = useState(false);
  const [toolbar, setToolbar] = useState(false);
  const [query, setQuery] = useState<AutocompleteQuery<AutocompletePrefix>>();
  const isComposing = useComposingCheck();
  const [markdown] = useSetting(settingsAtom, 'isMarkdown');
  const draftKey = getNewThreadDraftKey(room.roomId);
  const attempt = useMemo(() => getThreadCreationAttempt(mx, room.roomId), [mx, room.roomId]);
  const titles = useMemo(
    () =>
      new PrivateStorage(
        privateAccountKey(mx.baseUrl, mx.getSafeUserId(), mx.getDeviceId() ?? ''),
        'thread-titles'
      ),
    [mx]
  );
  const draft = usePersistentDraft(editor, draftKey, ignoreReply);
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canMessage = permissions.event(EventType.RoomMessage, mx.getSafeUserId());
  const ready = loaded && draft.ready;
  const locked = sending || !!pending;
  const valid = !!title.trim() && hasMessage && ready && canMessage;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (ready && !locked) nameRef.current?.focus();
  }, [ready, locked]);

  useEffect(() => {
    let active = true;
    Promise.all([titles.get<string>(draftKey), attempt.load()])
      .then(([savedTitle, state]) => {
        if (!active) return;
        setTitle(state?.title ?? savedTitle ?? '');
        setPending(state);
        setLoaded(true);
      })
      .catch(() => {
        if (active)
          setError('Не удалось восстановить черновик треда. Закройте и откройте его снова.');
      });
    return () => {
      active = false;
    };
  }, [titles, draftKey, attempt]);

  const closeAutocomplete = () => {
    setQuery(undefined);
    ReactEditor.focus(editor);
  };

  const create = async () => {
    if (busy.current || !ready || !canMessage || (!pending && !valid)) return;
    busy.current = true;
    setSending(true);
    setError('');
    setQuery(undefined);
    try {
      let content = pending?.content;
      if (!content) {
        const nodes = freshGroupMentionNodes(
          mentionsOutsideMarkdownCode(structuredClone(editor.children), undefined, markdown)
        );
        const groups = await resolveGroupMentions(
          mx,
          room,
          mentionsOutsideMarkdownCode(nodes, undefined, markdown)
        );
        const options = {
          allowTextFormatting: true,
          allowBlockMarkdown: markdown,
          allowInlineMarkdown: markdown,
          groupMentions: groups,
        };
        const body = toPlainText(nodes, markdown, groups).trim();
        if (!body) throw new Error('Напишите первое сообщение треда.');
        const html = trimCustomHtml(toMatrixCustomHTML(nodes, options));
        const mentions = getMentions(mx, room.roomId, { ...editor, children: nodes }, groups, html);
        content = {
          msgtype: MsgType.Text,
          body,
          'm.mentions': getMentionContent(Array.from(mentions.users), mentions.room),
          ...(!customHtmlEqualsPlainText(html, body)
            ? { format: 'org.matrix.custom.html' as const, formatted_body: html }
            : {}),
        };
        assertMentionContentSize(content, room.hasEncryptionStateEvent());
        // Save the editable draft before the first network request.
        await titles.set(draftKey, title);
        draft.save(nodes);
        await draft.flush();
      }
      const rootId = await attempt.send(mx, pending?.title ?? title, content);
      await titles.set(draftKey, undefined);
      resetEditor(editor);
      draft.save(editor.children);
      await draft.flush();
      await attempt.clear();
      if (mounted.current) onCreated(rootId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Не удалось создать тред. Повторите попытку.'
      );
      setPending(await attempt.load().catch(() => undefined));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const updateQuery = () => {
    const range = getPrevWordRange(editor);
    setQuery(range ? getAutocompleteQuery(editor, range, AUTOCOMPLETE_PREFIXES) : undefined);
  };
  const textError = error || draft.error;
  const createLabel = pending ? 'Повторить создание' : 'Создать тред';

  return (
    <Box direction="Column" grow="Yes" className={css.CreateBody}>
      <Scroll visibility="Hover" hideTrack>
        <Box direction="Column" className={css.CreateContent}>
          <div className={css.CreateIcon}>
            <Icon size="600" src={Icons.Thread} />
          </div>
          <Text as="h2" size="H3">
            Новый тред
          </Text>
          <Text size="T300" priority="300" className={css.CreateDescription}>
            Начните отдельное обсуждение в <b>{room.name}</b>. Все, у кого есть доступ к комнате,
            смогут присоединиться.
          </Text>
          <Box direction="Column" gap="200" className={css.CreateField}>
            <Box alignItems="Center" justifyContent="SpaceBetween">
              <Text as="label" htmlFor={titleId} size="L400" className={css.CreateLabel}>
                Название треда <span className={css.Required}>*</span>
              </Text>
              <Text size="T200" priority="300">
                {title.length}/{THREAD_NAME_MAX_LENGTH}
              </Text>
            </Box>
            <Input
              ref={nameRef}
              id={titleId}
              autoFocus
              value={title}
              disabled={!ready || !canMessage}
              readOnly={locked}
              onChange={(evt) => {
                const { value } = evt.currentTarget;
                setTitle(value);
                titles
                  .set(draftKey, value)
                  .catch(() => setError('Название пока не сохранено на устройстве.'));
              }}
              onKeyDown={(evt) => {
                if (evt.key === 'Enter' && !isComposing(evt)) {
                  evt.preventDefault();
                  ReactEditor.focus(editor);
                }
              }}
              placeholder="О чём будем говорить?"
              maxLength={THREAD_NAME_MAX_LENGTH}
              variant="SurfaceVariant"
              size="400"
              radii="300"
              className={css.CreateTitleInput}
            />
          </Box>
          <Box direction="Column" gap="200" className={css.CreateField}>
            <Text id={messageId} size="L400" className={css.CreateLabel}>
              Первое сообщение <span className={css.Required}>*</span>
            </Text>
            {query?.prefix === AutocompletePrefix.UserMention && (
              <UserMentionAutocomplete
                room={room}
                editor={editor}
                query={query}
                requestClose={closeAutocomplete}
              />
            )}
            {query?.prefix === AutocompletePrefix.RoomMention && (
              <RoomMentionAutocomplete
                roomId={room.roomId}
                editor={editor}
                query={query}
                requestClose={closeAutocomplete}
              />
            )}
            <div className={css.CreateEditor} role="group" aria-labelledby={messageId}>
              <CustomEditor
                editor={editor}
                editableName="NewThreadInput"
                placeholder="Начните обсуждение…"
                readOnly={!ready || !canMessage || locked}
                maxHeight="35vh"
                onChange={() => {
                  setHasMessage(!isEmptyEditor(editor));
                  if (
                    ready &&
                    !locked &&
                    editor.operations.some((op) => op.type !== 'set_selection')
                  )
                    draft.save(editor.children);
                  updateQuery();
                }}
                onKeyUp={updateQuery}
                onKeyDown={(evt) => {
                  if (isComposing(evt)) return;
                  if (isKeyHotkey('mod+enter', evt)) {
                    evt.preventDefault();
                    if (!evt.repeat) create();
                  }
                  if (evt.key === 'Escape' && query) {
                    evt.preventDefault();
                    setQuery(undefined);
                  }
                }}
                bottom={toolbar && <Toolbar />}
              />
              <Box
                className={css.CreateEditorBar}
                alignItems="Center"
                justifyContent="SpaceBetween"
              >
                <IconButton
                  type="button"
                  variant="SurfaceVariant"
                  size="300"
                  radii="300"
                  aria-label="Форматирование первого сообщения"
                  aria-pressed={toolbar}
                  onClick={() => setToolbar(!toolbar)}
                  disabled={locked}
                >
                  <Icon src={Icons.Alphabet} />
                </IconButton>
                <Text size="T200" priority="300">
                  Ctrl + Enter — создать тред
                </Text>
              </Box>
            </div>
          </Box>
          {!canMessage && (
            <Text role="alert" size="T300">
              Нет прав на отправку сообщений в этой комнате.
            </Text>
          )}
          {textError && (
            <Text role="alert" size="T300" className={css.CreateError}>
              {textError}
            </Text>
          )}
          {pending && (
            <Text size="T200" priority="300">
              {pending.rootId
                ? 'Название уже отправлено. Повторная попытка продолжит создание этого треда.'
                : 'Повторная попытка отправит сохранённое название и сообщение без дубликатов.'}
            </Text>
          )}
        </Box>
      </Scroll>
      <Box className={css.CreateFooter} alignItems="Center" justifyContent="End" gap="300">
        <Button type="button" variant="Secondary" fill="None" onClick={onCancel}>
          <Text size="B300">Отмена</Text>
        </Button>
        <Button
          type="button"
          className={css.CreateButton}
          disabled={!ready || !canMessage || sending || (!pending && !valid)}
          onClick={create}
          before={sending ? <Spinner size="100" /> : <Icon size="100" src={Icons.Thread} />}
        >
          <Text size="B300">{sending ? 'Создаём тред…' : createLabel}</Text>
        </Button>
      </Box>
    </Box>
  );
}
