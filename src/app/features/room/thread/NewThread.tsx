import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Input, Scroll, Spinner, Text } from 'folds';
import { EventType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { useEditor } from '../../../components/editor';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useComposingCheck } from '../../../hooks/useComposingCheck';
import { usePowerLevelsContext } from '../../../hooks/usePowerLevels';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { PrivateStorage, privateAccountKey } from '../../../utils/privateStorage';
import {
  THREAD_NAME_MAX_LENGTH,
  ThreadCreationState,
  getNewThreadDraftKey,
  getThreadCreationAttempt,
  getThreadEventFingerprint,
} from '../../../utils/threadCreation';
import { getThreadDraftKey } from '../../../state/room/threadPanel';
import { RoomInput, RoomInputSubmission } from '../RoomInput';
import * as css from './Thread.css';

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
  const [composerReady, setComposerReady] = useState(false);
  const [sending, setSending] = useState(false);
  const mounted = useRef(true);
  const nameRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const actions = useRef<Parameters<RoomInputSubmission['onReady']>[0]>();
  const rootId = useRef<string>();
  const finishing = useRef(false);
  const firstEvent = useRef<{ fingerprint: string; eventId?: string }>();
  const queue = useRef(Promise.resolve());
  const [pending, setPending] = useState<ThreadCreationState>();
  const [error, setError] = useState('');
  const [hasMessage, setHasMessage] = useState(false);
  const isComposing = useComposingCheck();
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
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canMessage = permissions.event(EventType.RoomMessage, mx.getSafeUserId());
  const ready = loaded && composerReady;
  const locked = sending || !!pending;
  const valid = !!title.trim() && hasMessage && ready && canMessage;
  const onReady = useCallback<RoomInputSubmission['onReady']>((value) => {
    actions.current = value;
    setComposerReady(true);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (ready) nameRef.current?.focus();
  }, [ready]);
  useEffect(() => {
    let active = true;
    Promise.all([titles.get<string>(draftKey), attempt.load()])
      .then(([savedTitle, state]) => {
        if (!active) return;
        setTitle(state?.title ?? savedTitle ?? '');
        setPending(state);
        if (state?.replyId) {
          rootId.current = state.rootId;
          firstEvent.current = {
            fingerprint: getThreadEventFingerprint(
              state.eventType ?? EventType.RoomMessage,
              state.content
            ),
            eventId: state.replyId,
          };
        }
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

  const complete = async () => {
    if (!rootId.current || finishing.current) return;
    finishing.current = true;
    setSending(true);
    try {
      await actions.current?.clear(getThreadDraftKey(room.roomId, rootId.current));
      await titles.set(draftKey, undefined);
      await attempt.clear();
      if (mounted.current) onCreated(rootId.current);
    } catch (cause) {
      finishing.current = false;
      throw cause;
    } finally {
      setSending(false);
    }
  };

  const sendEvent = useCallback<RoomInputSubmission['sendEvent']>(
    (eventType, content, send) => {
      const task = queue.current.then(async () => {
        if (finishing.current)
          throw new Error('Тред уже создан. Откройте его в списке обсуждений.');
        if (!ready || !canMessage || !permissions.event(eventType, mx.getSafeUserId()))
          throw new Error('Нет прав на отправку этого сообщения.');
        if (!title.trim()) throw new Error('Введите название треда.');
        if (pending && (await attempt.load())?.rootTxn !== pending.rootTxn)
          throw new Error(
            'Эта попытка уже завершена. Откройте созданный тред в списке обсуждений.'
          );
        setSending(true);
        setError('');
        try {
          // Later attachments in the same submission use the newly created root.
          const fingerprint = getThreadEventFingerprint(eventType, content);
          if (rootId.current) {
            // The saved first event may still be in the composer after a failed
            // later attachment. A retry drains the queue without repeating it.
            if (firstEvent.current?.fingerprint === fingerprint)
              return { event_id: firstEvent.current.eventId };
            return await send(rootId.current);
          }
          await titles.set(draftKey, title);
          const createdRoot = await attempt.send(mx, title, content, pending?.rootTxn, eventType);
          const state = await attempt.load();
          rootId.current = createdRoot;
          firstEvent.current = { fingerprint, eventId: state?.replyId };
          return { event_id: state?.replyId };
        } catch (cause) {
          setPending(await attempt.load().catch(() => undefined));
          throw cause;
        } finally {
          setSending(false);
        }
      });
      queue.current = task.then(
        () => undefined,
        () => undefined
      );
      return task;
    },
    [ready, canMessage, permissions, mx, title, titles, draftKey, attempt, pending]
  );

  const create = async () => {
    if (!ready || sending || (!pending && !valid)) return;
    setError('');
    try {
      if (pending) {
        await sendEvent(
          pending.eventType ?? EventType.RoomMessage,
          pending.content,
          async () => undefined
        );
        // Text restored by the failed submit is already in the saved event.
        if (['m.text', 'm.notice', 'm.emote'].includes(pending.content.msgtype ?? ''))
          await actions.current?.clear();
        if (await actions.current?.resumeAttachments()) await complete();
      } else await actions.current?.submit();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Не удалось создать тред. Повторите попытку.'
      );
    }
  };
  const createLabel = pending ? 'Повторить создание' : 'Создать тред';

  return (
    <Box direction="Column" grow="Yes" className={css.CreateBody} ref={containerRef}>
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
              readOnly={locked || !!rootId.current}
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
              Сообщение в треде <span className={css.Required}>*</span>
            </Text>
            <Text size="T200" priority="300">
              Название станет первым сообщением в комнате. В тред можно отправить текст, опрос, файл
              или стикер.
            </Text>
            <fieldset
              disabled={!ready || !canMessage || !title.trim() || locked}
              className={css.CreateComposer}
              aria-labelledby={messageId}
            >
              <RoomInput
                editor={editor}
                room={room}
                roomId={room.roomId}
                fileDropContainerRef={containerRef}
                draftKey={draftKey}
                editableName="NewThreadInput"
                placeholder="Начните обсуждение…"
                readOnly={locked}
                submission={{
                  disabled: !ready || !canMessage || !title.trim() || sending,
                  sendEvent,
                  onComplete: complete,
                  onReady,
                  onChange: setHasMessage,
                }}
              />
            </fieldset>
          </Box>
          {!canMessage && (
            <Text role="alert" size="T300">
              Нет прав на отправку сообщений в этой комнате.
            </Text>
          )}
          {error && (
            <Text role="alert" size="T300" className={css.CreateError}>
              {error}
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
