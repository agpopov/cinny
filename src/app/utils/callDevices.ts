export const callDeviceError = (cause: unknown): string => {
  const error = cause as { name?: string; message?: string } | undefined;
  const messages: Record<string, string> = {
    NotAllowedError:
      'Доступ к микрофону или камере запрещён. Разрешите его в настройках приложения или браузера и в настройках системы.',
    SecurityError: 'Система запретила доступ к устройствам. Проверьте разрешения приложения.',
    NotFoundError:
      'Микрофон или камера не найдены. Подключите устройство либо выключите его перед входом.',
    NotReadableError:
      'Не удалось открыть микрофон или камеру. Устройство может быть занято другим приложением.',
    AbortError: 'Проверка устройства прервана. Попробуйте ещё раз.',
    OverconstrainedError:
      'Устройство не поддерживает выбранные параметры. Выберите другое в настройках звонка.',
  };
  return (
    messages[error?.name ?? ''] ??
    error?.message ??
    'Не удалось начать звонок. Проверьте сеть и настройки сервера.'
  );
};
export const checkCallDevices = async (microphone: boolean, video: boolean): Promise<void> => {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Для звонка нужен HTTPS и доступ к медиаустройствам в браузере или системном WebView.'
    );
  }
  if (!microphone && !video) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: microphone, video });
  stream.getTracks().forEach((track) => track.stop());
};
