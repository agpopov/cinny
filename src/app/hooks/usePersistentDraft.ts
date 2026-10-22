import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Descendant } from 'slate';
import { Editor, Transforms } from 'slate';
import { PrivateStorage, privateAccountKey } from '../utils/privateStorage';
import { useMatrixClient } from './useMatrixClient';
import type { IReplyDraft } from '../state/room/roomInputDrafts';

type Draft = { message: Descendant[]; reply?: IReplyDraft };
const hasContent = (nodes: unknown[]): boolean =>
  nodes.some((node) => {
    if (!node || typeof node !== 'object') return false;
    const element = node as { text?: string; type?: string; children?: unknown[] };
    return (
      !!element.text ||
      ['mention', 'emoticon', 'command'].includes(element.type ?? '') ||
      (Array.isArray(element.children) && hasContent(element.children))
    );
  });

export const usePersistentDraft = (
  editor: Editor,
  draftKey: string,
  onRestoreReply: (reply?: IReplyDraft) => void
) => {
  const mx = useMatrixClient();
  const account = privateAccountKey(mx.baseUrl, mx.getSafeUserId(), mx.getDeviceId() ?? '');
  const storage = useMemo(() => new PrivateStorage(account, 'drafts'), [account]);
  const [error, setError] = useState<string>();
  const scopeKey = JSON.stringify([account, draftKey]);
  const [loadedScope, setLoadedScope] = useState<string>();
  const ready = loadedScope === scopeKey;
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef<{ draft: Draft; storage: PrivateStorage; key: string }>();

  const persist = useCallback(() => {
    if (!latest.current) return Promise.resolve();
    const pending = latest.current;
    const { draft } = pending;
    latest.current = undefined;
    return pending.storage
      .set(pending.key, hasContent(draft.message) || draft.reply ? draft : undefined)
      .then(() => setError(undefined))
      .catch(() => {
        if (!latest.current) latest.current = pending;
        setError('Черновик пока не сохранён на устройстве. Не закрывайте приложение.');
      });
  }, []);

  useEffect(() => {
    let active = true;
    const atStart = revision.current;
    setLoadedScope(undefined);
    storage
      .get<Draft>(draftKey)
      .then((draft) => {
        if (!active || revision.current !== atStart || !draft?.message?.length) return;
        if (!hasContent(editor.children)) {
          Editor.withoutNormalizing(editor, () => {
            Transforms.deselect(editor);
            [...editor.children].forEach(() => Transforms.removeNodes(editor, { at: [0] }));
            Transforms.insertNodes(editor, draft.message, { at: [0] });
            Transforms.select(editor, Editor.end(editor, []));
          });
          onRestoreReply(draft.reply);
        }
      })
      .catch(() => {
        if (active) setError('Не удалось восстановить черновик на устройстве.');
      })
      .finally(() => {
        if (active) setLoadedScope(scopeKey);
      });
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', persist);
    return () => {
      active = false;
      clearTimeout(timer.current);
      persist();
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', persist);
    };
  }, [storage, draftKey, editor, persist, onRestoreReply, scopeKey]);

  const save = useCallback(
    (message: Descendant[], reply?: IReplyDraft) => {
      revision.current += 1;
      latest.current = {
        draft: { message: JSON.parse(JSON.stringify(message)), reply },
        storage,
        key: draftKey,
      };
      clearTimeout(timer.current);
      timer.current = setTimeout(persist, 300);
    },
    [persist, storage, draftKey]
  );
  return { save, flush: persist, ready, error };
};
