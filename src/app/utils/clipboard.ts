import { invoke } from '@tauri-apps/api/core';
import { Image as NativeImage } from '@tauri-apps/api/image';
import { isDesktopApp } from './desktop';

export const hasNativeImageClipboard = () =>
  isDesktopApp() && /Linux|X11/i.test(navigator.userAgent);

/** Read only after a paste gesture; WebKitGTK can omit image clipboard files. */
export const readNativeClipboardImage = async (): Promise<File | undefined> => {
  let image: NativeImage;
  try {
    image = new NativeImage(await invoke<number>('plugin:clipboard-manager|read_image'));
  } catch (error) {
    if (String(error).includes('clipboard contents were not available in the requested format')) {
      return undefined;
    }
    throw error;
  }
  try {
    const { width, height } = await image.size();
    const rgba = await image.rgba();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Clipboard image canvas unavailable');
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error('Clipboard image encoding failed'));
      }, 'image/png');
    });
    return new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
  } finally {
    await image.close();
  }
};
