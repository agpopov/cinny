import { useLayoutEffect, useMemo } from 'react';
import type { ClipboardEventHandler, KeyboardEventHandler } from 'react';
import { t } from 'i18next';
import { getDataTransferFiles } from '../utils/dom';
import { hasNativeImageClipboard, readNativeClipboardImage } from '../utils/clipboard';
import { createFilePasteHandler } from '../utils/filePaste';

export const useFilePasteHandler = (
  onFiles: (files: File[]) => void,
  contextKey: string,
  disabled: boolean,
  onError: (message: string) => void
): { onPaste: ClipboardEventHandler; onKeyDown: KeyboardEventHandler } => {
  const handler = useMemo(
    () =>
      createFilePasteHandler({
        onFiles,
        getFiles: getDataTransferFiles,
        readImage: hasNativeImageClipboard() && !disabled ? readNativeClipboardImage : undefined,
        onError: () => onError(t('Unable to paste image. Save it and attach it as a file.')),
        disabled,
      }),
    [onFiles, disabled, onError]
  );
  // A room/thread change invalidates pending clipboard reads.
  useLayoutEffect(() => {
    handler.activate();
    return handler.dispose;
  }, [handler, contextKey]);
  return handler;
};
