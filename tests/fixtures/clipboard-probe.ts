import { getDataTransferFiles } from '../../src/app/utils/dom';
import { hasNativeImageClipboard, readNativeClipboardImage } from '../../src/app/utils/clipboard';
import { createFilePasteHandler } from '../../src/app/utils/filePaste';

if (!hasNativeImageClipboard()) throw new Error('Linux native clipboard fallback was not enabled');

// Exercises the production handler and Tauri IPC inside the packaged Linux WebView.
const input = document.createElement('div');
input.id = 'paste-probe';
input.contentEditable = 'true';
input.style.cssText =
  'position:fixed;top:0;left:0;width:600px;height:200px;background:white;z-index:999999';
document.body.append(input);
const results: unknown[] = [];
const events: unknown[] = [];
let reads = 0;
const handler = createFilePasteHandler({
  disabled: false,
  getFiles: getDataTransferFiles,
  readImage: () => {
    reads += 1;
    return readNativeClipboardImage();
  },
  onError: () => results.push({ error: 'clipboard read failed' }),
  onFiles: async (files) => {
    for (const file of files) {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()).slice(0, 8));
      const image = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const pixels = Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      URL.revokeObjectURL(url);
      results.push({
        name: file.name,
        type: file.type,
        width: canvas.width,
        height: canvas.height,
        bytes,
        pixels,
      });
    }
  },
});
input.addEventListener('keydown', handler.onKeyDown);
input.addEventListener('paste', (event) => {
  events.push({
    files: event.clipboardData?.files.length,
    text: event.clipboardData?.getData('text/plain'),
  });
  handler.onPaste(event as ClipboardEvent & { clipboardData: DataTransfer });
});
Object.assign(window, { clipboardProbe: { input, results, events, reads: () => reads, handler } });
