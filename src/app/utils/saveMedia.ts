import { fetchMedia } from './media';

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string }) => Promise<{
    createWritable: () => Promise<WritableStream<Uint8Array>>;
  }>;
};

/** Request the destination during the user gesture; stream without a whole-file Blob. */
export const streamMediaToDisk = async (
  src: string,
  filename: string
): Promise<'saved' | 'cancelled' | 'unsupported'> => {
  const picker = (window as FilePickerWindow).showSaveFilePicker;
  if (!picker) return 'unsupported';
  let destination;
  try {
    destination = await picker.call(window, { suggestedName: filename });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    // A denied picker is a real error, not permission to start another download.
    throw error;
  }
  const response = await fetchMedia(src);
  if (!response.body) throw new Error('Сервер не предоставил содержимое файла.');
  try {
    const writable = await destination.createWritable();
    await response.body.pipeTo(writable);
  } catch (error) {
    await response.body.cancel().catch(() => undefined);
    throw error;
  }
  return 'saved';
};
