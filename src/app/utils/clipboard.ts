import { invoke } from '@tauri-apps/api/core';
import { isDesktopApp } from './desktop';

export const hasNativeImageClipboard = () =>
  isDesktopApp() && /Linux|X11/i.test(navigator.userAgent);

/** Read only after a paste gesture; GTK supports both X11 and Wayland. */
export const readNativeClipboardImage = async (): Promise<File | undefined> => {
  const png = await invoke<string | null>('desktop_read_clipboard_image');
  if (!png) return undefined;
  const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
  return new File([bytes], `screenshot-${Date.now()}.png`, { type: 'image/png' });
};
