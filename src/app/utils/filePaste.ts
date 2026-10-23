type PasteEvent = {
  clipboardData: DataTransfer;
  defaultPrevented: boolean;
  preventDefault: () => void;
};
type PasteKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'defaultPrevented' | 'repeat'
>;

export const createFilePasteHandler = ({
  onFiles,
  getFiles,
  readImage,
  onError,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  getFiles: (data: DataTransfer) => File[] | undefined;
  readImage?: () => Promise<File | undefined>;
  onError: () => void;
  disabled: boolean;
}) => {
  let active = true;
  let version = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    version += 1;
    clearTimeout(timer);
  };
  const read = async () => {
    const request = version;
    try {
      const file = await readImage?.();
      if (active && request === version && file) onFiles([file]);
    } catch {
      if (active && request === version) onError();
    }
  };
  return {
    activate: () => {
      active = true;
    },
    dispose: () => {
      active = false;
      cancel();
    },
    onKeyDown: (event: PasteKeyEvent) => {
      if (!active || disabled || !readImage || event.defaultPrevented || event.repeat) return;
      const paste = event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'v';
      const insert = event.shiftKey && !event.ctrlKey && event.key === 'Insert';
      if (event.metaKey || event.altKey || (!paste && !insert)) return;
      cancel();
      // Older WebKitGTK emits no paste event at all for an image-only clipboard.
      // Normal text/file paste cancels this fallback before it reads the clipboard.
      timer = setTimeout(read, 100);
    },
    onPaste: (event: PasteEvent) => {
      cancel();
      if (!active || disabled || event.defaultPrevented) return;
      const files = getFiles(event.clipboardData);
      if (files) {
        event.preventDefault();
        onFiles(files);
        return;
      }
      if (!readImage || event.clipboardData.getData('text/plain')) return;
      const html = event.clipboardData.getData('text/html');
      if (html) {
        const template = document.createElement('template');
        template.innerHTML = html;
        if (template.content.textContent?.trim() || !template.content.querySelector('img')) return;
      }
      event.preventDefault();
      read();
    },
  };
};
