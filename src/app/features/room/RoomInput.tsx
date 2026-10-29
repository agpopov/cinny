import { t } from 'i18next';
import React, {
  KeyboardEventHandler,
  RefObject,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { isKeyHotkey } from 'is-hotkey';
import { EventType, IContent, MsgType, RelationType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { Descendant, Transforms, Editor } from 'slate';
import { flushSync } from 'react-dom';
import {
  Box,
  Button,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Line,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  Scroll,
  Text,
  config,
  toRem,
} from 'folds';
import { takeEditorSubmission, restoreEditorSubmission } from '../../components/editor/submission';
import { getMessageAttempt, getAttachmentAttempt } from '../../utils/messageAttempt';
import { mentionsOutsideMarkdownCode } from '../../components/editor/markdownCode';

import {
  resolveGroupMentions,
  assertMentionContentSize,
  freshGroupMentionNodes,
} from '../../utils/mentionGroups';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
  CustomEditor,
  Toolbar,
  toMatrixCustomHTML,
  toPlainText,
  AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  AutocompleteQuery,
  getAutocompleteQuery,
  getPrevWordRange,
  resetEditor,
  RoomMentionAutocomplete,
  UserMentionAutocomplete,
  EmoticonAutocomplete,
  createEmoticonElement,
  moveCursor,
  resetEditorHistory,
  customHtmlEqualsPlainText,
  trimCustomHtml,
  isEmptyEditor,
  getBeginCommand,
  trimCommand,
  getMentions,
} from '../../components/editor';
import { EmojiBoard, EmojiBoardTab } from '../../components/emoji-board';
import { UseStateProvider } from '../../components/UseStateProvider';
import {
  TUploadContent,
  cancelContentUpload,
  encryptFile,
  getMxIdLocalPart,
} from '../../utils/matrix';
import { useTypingStatusUpdater } from '../../hooks/useTypingStatusUpdater';
import { useFilePicker } from '../../hooks/useFilePicker';
import { useFilePasteHandler } from '../../hooks/useFilePasteHandler';
import { useFileDropZone } from '../../hooks/useFileDrop';
import {
  TUploadItem,
  TUploadMetadata,
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
  getUploadKey,
  IReplyDraft,
} from '../../state/room/roomInputDrafts';
import { UploadCardRenderer } from '../../components/upload-card';
import {
  UploadBoard,
  UploadBoardContent,
  UploadBoardHeader,
  UploadBoardImperativeHandlers,
} from '../../components/upload-board';
import {
  Upload,
  UploadStatus,
  UploadSuccess,
  createUploadFamilyObserverAtom,
} from '../../state/upload';
import { safeFile } from '../../utils/mimeTypes';
import { sendAttachments } from '../../utils/sendAttachments';
import { bytesToSize } from '../../utils/common';
import { useMediaConfig } from '../../hooks/useMediaConfig';
import {
  attachmentFileLimit,
  ATTACHMENT_QUEUE_LIMIT,
  ATTACHMENT_COUNT_LIMIT,
} from '../../utils/attachmentLimits';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
} from './msgContent';
import { getMemberDisplayName, getMentionContent, trimReplyFromBody } from '../../utils/room';
import { CommandAutocomplete } from './CommandAutocomplete';
import { AttachMenu } from './poll/AttachMenu';
import { POLL_START_TYPE } from '../../utils/poll';
import { Command, SHRUG, TABLEFLIP, UNFLIP, useCommands } from '../../hooks/useCommands';
import { mobileOrTablet } from '../../utils/user-agent';
import { useElementSizeObserver } from '../../hooks/useElementSizeObserver';
import { ReplyLayout, ThreadIndicator } from '../../components/message';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { useImagePackRooms } from '../../hooks/useImagePackRooms';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import colorMXID from '../../../util/colorMXID';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useTheme } from '../../hooks/useTheme';
import { useRoomCreatorsTag } from '../../hooks/useRoomCreatorsTag';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useComposingCheck } from '../../hooks/useComposingCheck';
import { IImageInfo } from '../../../types/matrix/common';
import { resolveSticker } from '../../plugins/custom-emoji/resolveSticker';
import { PrivateStorage, privateAccountKey } from '../../utils/privateStorage';
import { usePersistentDraft } from '../../hooks/usePersistentDraft';

const draftScopeUsers = new WeakMap<ReturnType<typeof useStore>, Map<string, number>>();
type SubmissionDraft = { message: Descendant[]; reply?: IReplyDraft };

export type RoomInputSubmission = {
  disabled: boolean;
  sendEvent: (
    eventType: string,
    content: IContent,
    send: (threadId: string) => Promise<unknown>
  ) => Promise<unknown>;
  onComplete: () => Promise<void>;
  onReady: (actions: {
    submit: () => Promise<void>;
    clear: (targetDraftKey?: string) => Promise<void>;
    resumeAttachments: () => Promise<boolean>;
  }) => void;
  onChange: (hasContent: boolean) => void;
};

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement>;
  roomId: string;
  room: Room;
  /** Если задан — сообщения отправляются в этот тред. */
  threadRootId?: string;
  /** Ключ черновиков (у треда свой, чтобы не смешивать с полем комнаты). */
  draftKey?: string;
  editableName?: string;
  placeholder?: string;
  readOnly?: boolean;
  submission?: RoomInputSubmission;
}
export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  (
    {
      editor,
      fileDropContainerRef,
      roomId,
      room,
      threadRootId,
      draftKey: draftKeyProp,
      editableName = 'RoomInput',
      placeholder = 'Написать сообщение…',
      readOnly,
      submission,
    },
    ref
  ) => {
    const draftKey = draftKeyProp ?? roomId;
    const store = useStore();
    const threadId = threadRootId ?? null;
    const mx = useMatrixClient();
    const sendingRef = useRef(false);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [failedDraft, setFailedDraft] = useState<SubmissionDraft>();
    const messageAttempt = getMessageAttempt(mx, draftKey);
    const sendScope = useRef(0);
    useEffect(() => {
      sendingRef.current = false;
      setSending(false);
      setSendError('');
      setFailedDraft(undefined);
      return () => {
        sendScope.current += 1;
      };
    }, [draftKey, editor]);
    useEffect(() => {
      let scopes = draftScopeUsers.get(store);
      if (!scopes) {
        scopes = new Map();
        draftScopeUsers.set(store, scopes);
      }
      const users = scopes;
      users.set(draftKey, (users.get(draftKey) ?? 0) + 1);
      return () => {
        users.set(draftKey, (users.get(draftKey) ?? 1) - 1);
        queueMicrotask(() => {
          if (users.get(draftKey)) return;
          users.delete(draftKey);
          if (!store.get(roomIdToMsgDraftAtomFamily(draftKey)).length)
            roomIdToMsgDraftAtomFamily.remove(draftKey);
          if (!store.get(roomIdToReplyDraftAtomFamily(draftKey)))
            roomIdToReplyDraftAtomFamily.remove(draftKey);
          if (!store.get(roomIdToUploadItemsAtomFamily(draftKey)).length)
            roomIdToUploadItemsAtomFamily.remove(draftKey);
        });
      };
    }, [store, draftKey]);
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [isMarkdown] = useSetting(settingsAtom, 'isMarkdown');
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
    const direct = useIsDirectRoom();
    const commands = useCommands(mx, room);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const [msgDraft, setMsgDraft] = useAtom(roomIdToMsgDraftAtomFamily(draftKey));
    const [replyDraft, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(draftKey));
    const {
      save: saveDraft,
      flush: flushDraft,
      ready: draftReady,
      error: draftError,
    } = usePersistentDraft(editor, draftKey, setReplyDraft);
    useEffect(() => {
      if (draftReady) saveDraft(editor.children, replyDraft);
    }, [draftReady, replyDraft, editor, saveDraft]);

    const replyUserID = replyDraft?.userId;

    const powerLevelTags = usePowerLevelTags(room, powerLevels);
    const creatorsTag = useRoomCreatorsTag();
    const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
    const theme = useTheme();
    const accessibleTagColors = useAccessiblePowerTagColors(
      theme.kind,
      creatorsTag,
      powerLevelTags
    );

    const replyPowerTag = replyUserID ? getMemberPowerTag(replyUserID) : undefined;
    const replyPowerColor = replyPowerTag?.color
      ? accessibleTagColors.get(replyPowerTag.color)
      : undefined;
    const replyUsernameColor =
      legacyUsernameColor || direct ? colorMXID(replyUserID ?? '') : replyPowerColor;

    const [uploadBoard, setUploadBoard] = useState(true);
    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(draftKey));
    const selectedFilesRef = useRef(selectedFiles);
    selectedFilesRef.current = selectedFiles;
    const uploadFamilyObserverAtom = createUploadFamilyObserverAtom(
      roomUploadAtomFamily,
      selectedFiles.map((f) => f.file)
    );
    const uploadBoardHandlers = useRef<UploadBoardImperativeHandlers>();

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);

    const [toolbar, setToolbar] = useSetting(settingsAtom, 'editorToolbar');
    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();

    const sendTypingStatus = useTypingStatusUpdater(mx, roomId);

    const mediaConfig = useMediaConfig();
    const serverFileLimit = mediaConfig['m.upload.size'];
    const fileLimit = attachmentFileLimit(serverFileLimit, room.hasEncryptionStateEvent());
    const preparation = useRef(Promise.resolve());
    const pendingBytes = useRef(0);
    const pendingCount = useRef(0);
    const [preparingFiles, setPreparingFiles] = useState(false);
    const handleFiles = useCallback(
      (files: File[]) => {
        setUploadBoard(true);
        const errors: string[] = [];
        let bytes = selectedFilesRef.current.reduce(
          (sum, item) => sum + item.file.size,
          pendingBytes.current
        );
        let count = selectedFilesRef.current.length + pendingCount.current;
        const accepted = files.filter((file) => {
          if (file.size > fileLimit) {
            errors.push(`${file.name}: лимит файла ${bytesToSize(fileLimit)}`);
            return false;
          }
          if (bytes + file.size > ATTACHMENT_QUEUE_LIMIT || count >= ATTACHMENT_COUNT_LIMIT) {
            errors.push(
              `${file.name}: очередь ограничена ${bytesToSize(
                ATTACHMENT_QUEUE_LIMIT
              )} и ${ATTACHMENT_COUNT_LIMIT} файлами`
            );
            return false;
          }
          bytes += file.size;
          count += 1;
          return true;
        });
        if (errors.length) setSendError(errors.join('\n'));
        if (!accepted.length) return Promise.resolve();
        const reserved = accepted.reduce((sum, file) => sum + file.size, 0);
        pendingBytes.current += reserved;
        pendingCount.current += accepted.length;
        setPreparingFiles(true);
        const run = async () => {
          const fileItems: TUploadItem[] = [];
          for (let fileIndex = 0; fileIndex < accepted.length; fileIndex += 1) {
            const original = accepted[fileIndex];
            try {
              const file = safeFile(original);
              // Sequential preparation bounds memory and preserves selection order.
              // eslint-disable-next-line no-await-in-loop
              const prepared = await (room.hasEncryptionStateEvent()
                ? encryptFile(file)
                : Promise.resolve({ file, originalFile: file, encInfo: undefined }));
              fileItems.push({ ...prepared, metadata: { markedAsSpoiler: false } });
            } catch {
              errors.push(`${original.name}: не удалось подготовить файл. Добавьте его ещё раз.`);
            }
          }
          selectedFilesRef.current = [...selectedFilesRef.current, ...fileItems];
          setSelectedFiles({ type: 'PUT', item: fileItems });
          if (errors.length) setSendError(errors.join('\n'));
        };
        const task = preparation.current.then(run).finally(() => {
          pendingBytes.current -= reserved;
          pendingCount.current -= accepted.length;
          setPreparingFiles(pendingCount.current > 0);
        });
        preparation.current = task.catch(() => undefined);
        return task;
      },
      [setSelectedFiles, room, fileLimit]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const filePaste = useFilePasteHandler(handleFiles, draftKey, !draftReady, setSendError);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);
    const [hideStickerBtn, setHideStickerBtn] = useState(document.body.clientWidth < 500);

    const isComposing = useComposingCheck();

    useElementSizeObserver(
      useCallback(() => fileDropContainerRef.current, [fileDropContainerRef]),
      useCallback((width) => setHideStickerBtn(width < 500), [])
    );

    useEffect(() => {
      Transforms.insertFragment(editor, msgDraft);
    }, [editor, msgDraft]);

    useEffect(
      () => () => {
        if (!isEmptyEditor(editor)) {
          const parsedDraft = JSON.parse(JSON.stringify(editor.children));
          setMsgDraft(parsedDraft);
        } else {
          setMsgDraft([]);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
      },
      [draftKey, editor, setMsgDraft]
    );

    const handleFileMetadata = useCallback(
      (fileItem: TUploadItem, metadata: TUploadMetadata) => {
        setSelectedFiles({
          type: 'REPLACE',
          item: fileItem,
          replacement: { ...fileItem, metadata },
        });
      },
      [setSelectedFiles]
    );

    const handleRemoveUpload = useCallback(
      (upload: TUploadContent | TUploadContent[]) => {
        const uploads = Array.isArray(upload) ? upload : [upload];
        selectedFilesRef.current = selectedFilesRef.current.filter(
          (item) => !uploads.includes(item.file)
        );
        setSelectedFiles({
          type: 'DELETE',
          item: selectedFiles.filter((f) => uploads.find((u) => u === f.file)),
        });
        uploads.forEach((u) => roomUploadAtomFamily.remove(u));
      },
      [setSelectedFiles, selectedFiles]
    );

    const handleCancelUpload = async (uploads: Upload[]) => {
      const removals = await Promise.all(
        uploads.map(async (upload) => {
          try {
            await getAttachmentAttempt(mx, upload.file).cancel(mx, roomId);
            if (upload.status === UploadStatus.Loading)
              await cancelContentUpload(mx, upload.promise);
            return true;
          } catch (cause) {
            setSendError(cause instanceof Error ? cause.message : String(cause));
            return false;
          }
        })
      );
      handleRemoveUpload(
        uploads.filter((_, index) => removals[index]).map((upload) => upload.file)
      );
    };

    const handleSendUpload = async (uploads: UploadSuccess[]) => {
      setSendError('');
      const failures = await sendAttachments(uploads, {
        prepare: async (upload) => {
          const fileItem = selectedFiles.find((f) => f.file === upload.file);
          if (!fileItem) throw new Error('Broken upload');
          const { type } = fileItem.originalFile;
          if (type.startsWith('image/')) return getImageMsgContent(mx, fileItem, upload.mxc);
          if (type.startsWith('video/')) return getVideoMsgContent(mx, fileItem, upload.mxc);
          if (type.startsWith('audio/')) return getAudioMsgContent(fileItem, upload.mxc);
          return getFileMsgContent(fileItem, upload.mxc);
        },
        send: (content, upload) => {
          const attempt = getAttachmentAttempt(mx, upload.file);
          const metadata = selectedFilesRef.current.find(
            (item) => item.file === upload.file
          )?.metadata;
          const dispatch = (targetThread = threadId) =>
            attempt.send(
              mx,
              roomId,
              targetThread,
              content as Parameters<typeof mx.sendMessage>[2],
              JSON.stringify([upload.mxc, metadata])
            );
          return submission
            ? submission.sendEvent(EventType.RoomMessage, content, dispatch)
            : dispatch();
        },
        isPending: (upload) => selectedFilesRef.current.some((item) => item.file === upload.file),
        onSent: (upload) => handleRemoveUpload(upload.file),
      });
      if (!failures.length && uploads.length) await submission?.onComplete();
      if (failures.length) {
        const [error] = failures;
        setSendError(
          error instanceof Error
            ? error.message
            : 'Не удалось отправить вложение. Повторите попытку.'
        );
      }
    };

    const send = useCallback(
      async (retryDraft?: SubmissionDraft) => {
        if (sendingRef.current || !draftReady || submission?.disabled) return;
        if (
          failedDraft &&
          !retryDraft &&
          JSON.stringify([editor.children, replyDraft]) !==
            JSON.stringify([failedDraft.message, failedDraft.reply])
        ) {
          setSendError(
            'Повторите отправку предыдущего сообщения или отмените её. Новый текст сохранён в поле ввода.'
          );
          return;
        }
        if (!retryDraft && isEmptyEditor(editor)) {
          uploadBoardHandlers.current?.handleSend().catch((cause) => {
            setSendError(cause instanceof Error ? cause.message : String(cause));
          });
          return;
        }
        sendingRef.current = true;
        setSending(true);
        setSendError('');
        const scope = sendScope.current;
        const sendUploads = retryDraft ? undefined : uploadBoardHandlers.current?.handleSend;
        const submittedReply = retryDraft ? retryDraft.reply : replyDraft;
        let message = retryDraft?.message ?? structuredClone(editor.children);
        const original = JSON.stringify(message);
        try {
          if (
            !retryDraft ||
            JSON.stringify([editor.children, replyDraft]) ===
              JSON.stringify([retryDraft.message, retryDraft.reply])
          ) {
            flushSync(() => {
              message = takeEditorSubmission(editor);
              setReplyDraft(undefined);
              setAutocompleteQuery(undefined);
            });
            saveDraft(editor.children);
            ReactEditor.focus(editor);
            sendTypingStatus(false);
          }
          const nodes = freshGroupMentionNodes(
            mentionsOutsideMarkdownCode(structuredClone(message), undefined, isMarkdown)
          );
          const sendEditor = { ...editor, children: nodes };
          const groupMentions = await resolveGroupMentions(mx, room, nodes);
          if (!submission)
            sendUploads?.().catch((cause) => {
              if (scope === sendScope.current) {
                setSendError(cause instanceof Error ? cause.message : String(cause));
              }
            });

          const commandName = submission ? undefined : getBeginCommand(sendEditor);
          let plainText = toPlainText(nodes, isMarkdown, groupMentions).trim();
          let customHtml = trimCustomHtml(
            toMatrixCustomHTML(nodes, {
              groupMentions,
              allowTextFormatting: true,
              allowBlockMarkdown: isMarkdown,
              allowInlineMarkdown: isMarkdown,
            })
          );
          let msgType = MsgType.Text;

          if (commandName) {
            plainText = trimCommand(commandName, plainText);
            customHtml = trimCommand(commandName, customHtml);
          }
          if (commandName === Command.Me) {
            msgType = MsgType.Emote;
          } else if (commandName === Command.Notice) {
            msgType = MsgType.Notice;
          } else if (commandName === Command.Shrug) {
            plainText = `${SHRUG} ${plainText}`;
            customHtml = `${SHRUG} ${customHtml}`;
          } else if (commandName === Command.TableFlip) {
            plainText = `${TABLEFLIP} ${plainText}`;
            customHtml = `${TABLEFLIP} ${customHtml}`;
          } else if (commandName === Command.UnFlip) {
            plainText = `${UNFLIP} ${plainText}`;
            customHtml = `${UNFLIP} ${customHtml}`;
          } else if (commandName) {
            const commandContent = commands[commandName as Command];
            if (commandContent) {
              commandContent.exe(plainText);
            }
            await flushDraft();
            return;
          }

          if (plainText === '') return;

          const body = plainText;
          const formattedBody = customHtml;
          const mentionData = getMentions(mx, roomId, sendEditor, groupMentions, customHtml);

          const content: IContent = {
            msgtype: msgType,
            body,
          };

          if (submittedReply && submittedReply.userId !== mx.getUserId()) {
            mentionData.users.add(submittedReply.userId);
          }

          const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);
          content['m.mentions'] = mMentions;

          if (submittedReply || !customHtmlEqualsPlainText(formattedBody, body)) {
            content.format = 'org.matrix.custom.html';
            content.formatted_body = formattedBody;
          }
          if (submittedReply) {
            content['m.relates_to'] = {
              'm.in_reply_to': {
                event_id: submittedReply.eventId,
              },
            };
            if (!threadId && submittedReply.relation?.rel_type === RelationType.Thread) {
              content['m.relates_to'].event_id = submittedReply.relation.event_id;
              content['m.relates_to'].rel_type = RelationType.Thread;
              content['m.relates_to'].is_falling_back = false;
            }
          }
          assertMentionContentSize(
            content,
            !!room.currentState.getStateEvents('m.room.encryption', '')
          );
          const dispatch = (targetThread = threadId) =>
            messageAttempt.send(
              mx,
              roomId,
              targetThread,
              content as Parameters<typeof mx.sendMessage>[2],
              JSON.stringify([original, submittedReply])
            );
          if (submission) await submission.sendEvent(EventType.RoomMessage, content, dispatch);
          else await dispatch();
          if (scope === sendScope.current) setFailedDraft(undefined);
          await flushDraft();
          if (submission) {
            if (sendUploads) await sendUploads();
            else await submission.onComplete();
          }
        } catch (error) {
          if (scope === sendScope.current) {
            let restored = false;
            flushSync(() => {
              restored = restoreEditorSubmission(editor, message);
              if (restored) setReplyDraft(submittedReply);
              setFailedDraft(
                restored && !messageAttempt.pending ? undefined : { message, reply: submittedReply }
              );
            });
            if (restored) saveDraft(editor.children, submittedReply);
            await flushDraft();
          }
          if (scope === sendScope.current) {
            setSendError(
              error instanceof Error
                ? error.message
                : 'Не удалось отправить сообщение. Повторите попытку.'
            );
          }
        } finally {
          if (scope === sendScope.current) {
            sendingRef.current = false;
            setSending(false);
          }
        }
      },
      [
        mx,
        room,
        roomId,
        threadId,
        editor,
        replyDraft,
        sendTypingStatus,
        setReplyDraft,
        saveDraft,
        flushDraft,
        messageAttempt,
        isMarkdown,
        commands,
        draftReady,
        failedDraft,
        submission,
      ]
    );
    const submit = useCallback(() => send(), [send]);
    const onReady = submission?.onReady;
    const onContentChange = submission?.onChange;
    useEffect(() => {
      if (!draftReady) return;
      onReady?.({
        submit,
        clear: async (targetDraftKey) => {
          if (targetDraftKey) {
            await preparation.current;
            const message = structuredClone(editor.children);
            const storage = new PrivateStorage(
              privateAccountKey(mx.baseUrl, mx.getSafeUserId(), mx.getDeviceId() ?? ''),
              'drafts'
            );
            await storage.set(targetDraftKey, isEmptyEditor(editor) ? undefined : { message });
            store.set(
              roomIdToMsgDraftAtomFamily(targetDraftKey),
              isEmptyEditor(editor) ? [] : message
            );
            const remaining = selectedFilesRef.current;
            store.set(roomIdToUploadItemsAtomFamily(targetDraftKey), {
              type: 'PUT',
              item: remaining,
            });
            setSelectedFiles({ type: 'DELETE', item: remaining });
            selectedFilesRef.current = [];
          }
          resetEditor(editor);
          setReplyDraft(undefined);
          saveDraft(editor.children);
          await flushDraft();
        },
        resumeAttachments: async () => {
          await uploadBoardHandlers.current?.handleSend();
          return selectedFilesRef.current.length === 0;
        },
      });
    }, [
      draftReady,
      onReady,
      submit,
      editor,
      setReplyDraft,
      saveDraft,
      flushDraft,
      mx,
      store,
      setSelectedFiles,
    ]);
    useEffect(() => {
      if (draftReady) onContentChange?.(!isEmptyEditor(editor) || selectedFiles.length > 0);
    }, [draftReady, editor, msgDraft, selectedFiles.length, onContentChange]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        filePaste.onKeyDown(evt);
        if (evt.defaultPrevented || !draftReady || isComposing(evt)) return;
        if (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) {
          evt.preventDefault();
          if (!evt.repeat) submit();
          return;
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (autocompleteQuery) {
            setAutocompleteQuery(undefined);
            return;
          }
          setReplyDraft(undefined);
        }
      },
      [
        submit,
        setReplyDraft,
        enterForNewline,
        autocompleteQuery,
        isComposing,
        filePaste,
        draftReady,
      ]
    );

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        if (!hideActivity && !submission) {
          sendTypingStatus(!isEmptyEditor(editor));
        }

        const prevWordRange = getPrevWordRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery<AutocompletePrefix>(editor, prevWordRange, AUTOCOMPLETE_PREFIXES)
          : undefined;
        setAutocompleteQuery(query);
      },
      [editor, sendTypingStatus, hideActivity, submission]
    );

    const handleCloseAutocomplete = useCallback(() => {
      setAutocompleteQuery(undefined);
      ReactEditor.focus(editor);
    }, [editor]);

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor);
    };

    const handleStickerSelect = async (
      url: string,
      shortcode: string,
      label: string,
      info?: IImageInfo
    ) => {
      setSendError('');
      try {
        if (!room.currentState.maySendEvent(EventType.Sticker, mx.getSafeUserId())) {
          throw new Error('У вас нет разрешения отправлять стикеры в этой комнате.');
        }
        const stickerMxc = await resolveSticker(mx, url, import.meta.env.BASE_URL);
        // Packs already contain ImageInfo. Fetching the image again before
        // sending made stickers fail on slow networks and authenticated media.
        const content = {
          body: label || shortcode,
          url: stickerMxc,
          info: {
            ...info,
            w: Number.isFinite(info?.w) && (info?.w ?? 0) > 0 ? info?.w : 256,
            h: Number.isFinite(info?.h) && (info?.h ?? 0) > 0 ? info?.h : 256,
          },
        };
        const dispatch = (targetThread = threadId) =>
          mx.sendEvent(roomId, targetThread, EventType.Sticker, content);
        if (submission) {
          await submission.sendEvent(EventType.Sticker, content, dispatch);
          await submission.onComplete();
        } else await dispatch();
      } catch (error) {
        setSendError(
          error instanceof Error ? error.message : 'Не удалось отправить стикер. Повторите попытку.'
        );
      }
    };

    return (
      <div ref={ref}>
        {(preparingFiles || selectedFiles.length > 0) && (
          <Text size="T200" priority="300" role="status" aria-live="polite">
            {preparingFiles ? 'Подготовка файлов… ' : ''}
            {serverFileLimit
              ? `Лимит сервера: ${bytesToSize(serverFileLimit)}. `
              : 'Сервер не сообщил лимит файла. '}
            {room.hasEncryptionStateEvent() ? `Лимит шифрования: ${bytesToSize(fileLimit)}. ` : ''}
            {`Очередь: до ${bytesToSize(ATTACHMENT_QUEUE_LIMIT)}.`}
          </Text>
        )}
        {selectedFiles.length > 0 && (
          <UploadBoard
            header={
              <UploadBoardHeader
                open={uploadBoard}
                onToggle={() => setUploadBoard(!uploadBoard)}
                uploadFamilyObserverAtom={uploadFamilyObserverAtom}
                onSend={handleSendUpload}
                imperativeHandlerRef={uploadBoardHandlers}
                onCancel={handleCancelUpload}
              />
            }
          >
            {uploadBoard && (
              <Scroll size="300" hideTrack visibility="Hover">
                <UploadBoardContent>
                  {Array.from(selectedFiles)
                    .reverse()
                    .map((fileItem) => (
                      <UploadCardRenderer
                        key={getUploadKey(fileItem.file)}
                        isEncrypted={!!fileItem.encInfo}
                        fileItem={fileItem}
                        setMetadata={handleFileMetadata}
                        onRemove={async (file) => {
                          try {
                            await getAttachmentAttempt(mx, file).cancel(mx, roomId);
                            handleRemoveUpload(file);
                          } catch (cause) {
                            setSendError(cause instanceof Error ? cause.message : String(cause));
                          }
                        }}
                      />
                    ))}
                </UploadBoardContent>
              </Scroll>
            )}
          </UploadBoard>
        )}
        <Overlay
          open={dropZoneVisible}
          backdrop={<OverlayBackdrop />}
          style={{ pointerEvents: 'none' }}
        >
          <OverlayCenter>
            <Dialog variant="Primary">
              <Box
                direction="Column"
                justifyContent="Center"
                alignItems="Center"
                gap="500"
                style={{ padding: toRem(60) }}
              >
                <Icon size="600" src={Icons.File} />
                <Text size="H4" align="Center">
                  {t('Drop Files in "{{value1}}"', { value1: room?.name || t('Room') })}
                </Text>
                <Text align="Center">
                  {t('Drag and drop files here or click for selection dialog')}
                </Text>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
        {autocompleteQuery?.prefix === AutocompletePrefix.RoomMention && (
          <RoomMentionAutocomplete
            roomId={roomId}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.UserMention && (
          <UserMentionAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {!submission && autocompleteQuery?.prefix === AutocompletePrefix.Command && (
          <CommandAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {(sendError || draftError) && (
          <Text role="alert" size="T300" style={{ padding: config.space.S300 }}>
            {sendError || draftError}
          </Text>
        )}
        {sendError && (messageAttempt.pending || failedDraft) && (
          <Box direction="Column" gap="200">
            {failedDraft && (
              <Text size="T300" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                Неотправленное сообщение: {toPlainText(failedDraft.message, isMarkdown)}
              </Text>
            )}
            <Box gap="200" wrap="Wrap">
              <Button
                size="300"
                variant="Secondary"
                disabled={sending}
                onClick={() => send(failedDraft)}
              >
                <Text>Повторить отправку</Text>
              </Button>
              <Button
                size="300"
                variant="Secondary"
                disabled={sending}
                onClick={async () => {
                  const scope = sendScope.current;
                  try {
                    await messageAttempt.cancel(mx, roomId);
                    if (scope !== sendScope.current) return;
                    if (failedDraft) {
                      let recoveredReply = replyDraft;
                      flushSync(() => {
                        if (restoreEditorSubmission(editor, failedDraft.message)) {
                          recoveredReply = failedDraft.reply;
                          setReplyDraft(failedDraft.reply);
                        } else if (
                          JSON.stringify(editor.children) !== JSON.stringify(failedDraft.message)
                        ) {
                          // Cancellation keeps both texts available for editing.
                          Transforms.insertNodes(editor, structuredClone(failedDraft.message), {
                            at: [0],
                          });
                          editor.onChange();
                        }
                      });
                      saveDraft(editor.children, recoveredReply);
                      setFailedDraft(undefined);
                    }
                    setSendError(
                      'Локальная попытка отменена. Неотправленный текст сохранён в черновике. Если сервер уже принял сообщение, оно останется в истории.'
                    );
                  } catch (cause) {
                    if (scope === sendScope.current) {
                      setSendError(cause instanceof Error ? cause.message : String(cause));
                    }
                  }
                }}
              >
                <Text>Отменить локальную попытку</Text>
              </Button>
            </Box>
          </Box>
        )}
        <CustomEditor
          readOnly={readOnly || !draftReady || submission?.disabled}
          onChange={() => {
            onContentChange?.(!isEmptyEditor(editor) || selectedFiles.length > 0);
            if (
              draftReady &&
              editor.operations.some((operation) => operation.type !== 'set_selection')
            ) {
              saveDraft(editor.children, replyDraft);
            }
            const range = getPrevWordRange(editor);
            setAutocompleteQuery(
              range ? getAutocompleteQuery(editor, range, AUTOCOMPLETE_PREFIXES) : undefined
            );
          }}
          editableName={editableName}
          editor={editor}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPaste={filePaste.onPaste}
          top={
            replyDraft && (
              <div>
                <Box
                  alignItems="Center"
                  gap="300"
                  style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                >
                  <IconButton
                    aria-label="Закрыть"
                    onClick={() => setReplyDraft(undefined)}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                  >
                    <Icon src={Icons.Cross} size="50" />
                  </IconButton>
                  <Box direction="Row" gap="200" alignItems="Center">
                    {replyDraft.relation?.rel_type === RelationType.Thread && <ThreadIndicator />}
                    <ReplyLayout
                      userColor={replyUsernameColor}
                      username={
                        <Text size="T300" truncate>
                          <b>
                            {getMemberDisplayName(room, replyDraft.userId) ??
                              getMxIdLocalPart(replyDraft.userId) ??
                              replyDraft.userId}
                          </b>
                        </Text>
                      }
                    >
                      <Text size="T300" truncate>
                        {trimReplyFromBody(replyDraft.body)}
                      </Text>
                    </ReplyLayout>
                  </Box>
                </Box>
              </div>
            )
          }
          before={
            <AttachMenu
              roomId={roomId}
              threadRootId={threadRootId}
              onPickFile={() => pickFile('*')}
              creatingThread={!!submission}
              onPollSubmit={
                submission
                  ? async (content) => {
                      await submission.sendEvent(POLL_START_TYPE, content, (targetThread) =>
                        mx.sendEvent(
                          roomId,
                          targetThread,
                          POLL_START_TYPE as never,
                          content as never
                        )
                      );
                      await submission.onComplete();
                    }
                  : undefined
              }
            />
          }
          after={
            <>
              <IconButton
                variant="SurfaceVariant"
                size="300"
                radii="300"
                aria-label={
                  toolbar ? 'Скрыть панель форматирования' : 'Показать панель форматирования'
                }
                aria-pressed={toolbar}
                onClick={() => setToolbar(!toolbar)}
              >
                <Icon src={toolbar ? Icons.AlphabetUnderline : Icons.Alphabet} />
              </IconButton>
              <UseStateProvider initial={undefined}>
                {(emojiBoardTab: EmojiBoardTab | undefined, setEmojiBoardTab) => (
                  <PopOut
                    offset={16}
                    alignOffset={-44}
                    position="Top"
                    align="End"
                    anchor={
                      emojiBoardTab === undefined
                        ? undefined
                        : emojiBtnRef.current?.getBoundingClientRect() ?? undefined
                    }
                    content={
                      <EmojiBoard
                        tab={emojiBoardTab}
                        onTabChange={setEmojiBoardTab}
                        imagePackRooms={imagePackRooms}
                        returnFocusOnDeactivate={false}
                        onEmojiSelect={handleEmoticonSelect}
                        onCustomEmojiSelect={handleEmoticonSelect}
                        onStickerSelect={handleStickerSelect}
                        requestClose={() => {
                          setEmojiBoardTab((tab) => {
                            if (tab) {
                              if (!mobileOrTablet()) ReactEditor.focus(editor);
                              return undefined;
                            }
                            return tab;
                          });
                        }}
                      />
                    }
                  >
                    {!hideStickerBtn && (
                      <IconButton
                        aria-label={t('Stickers')}
                        aria-pressed={emojiBoardTab === EmojiBoardTab.Sticker}
                        onClick={() => setEmojiBoardTab(EmojiBoardTab.Sticker)}
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                      >
                        <Icon
                          src={Icons.Sticker}
                          filled={emojiBoardTab === EmojiBoardTab.Sticker}
                        />
                      </IconButton>
                    )}
                    <IconButton
                      ref={emojiBtnRef}
                      aria-label={t('Emoji')}
                      aria-pressed={
                        hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                      }
                      onClick={() => setEmojiBoardTab(EmojiBoardTab.Emoji)}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                    >
                      <Icon
                        src={Icons.Smile}
                        filled={
                          hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                        }
                      />
                    </IconButton>
                  </PopOut>
                )}
              </UseStateProvider>
              <IconButton
                aria-label={t('Send message')}
                disabled={sending}
                onMouseDown={(evt) => evt.preventDefault()}
                onClick={submit}
                variant="SurfaceVariant"
                size="300"
                radii="300"
              >
                <Icon src={Icons.Send} />
              </IconButton>
            </>
          }
          bottom={
            toolbar && (
              <div>
                <Line variant="SurfaceVariant" size="300" />
                <Toolbar />
              </div>
            )
          }
        />
      </div>
    );
  }
);
