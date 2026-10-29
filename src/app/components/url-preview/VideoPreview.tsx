import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Text } from 'folds';
import { VideoPreview as VideoPreviewData } from '../../utils/videoPreview';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import * as css from './UrlPreviewCard.css';

export function VideoPreview({
  preview,
  autoLoad,
  onReady,
}: {
  preview: VideoPreviewData;
  autoLoad: boolean;
  onReady?: (ready: boolean) => void;
}) {
  const [load, setLoad] = useState(autoLoad);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  useResizeObserver(
    useCallback((entries) => setWidth(entries[0].contentRect.width), []),
    () => container.current
  );
  const unavailable = preview.requiresHttps && window.location.protocol !== 'https:';
  const tooNarrow = width > 0 && width < preview.minimumWidth;
  useEffect(() => {
    if (unavailable || tooNarrow || !load || failed) onReady?.(false);
    return () => onReady?.(false);
  }, [unavailable, tooNarrow, load, failed, onReady]);

  const renderPreview = () => {
    if (unavailable || tooNarrow)
      return (
        <Text className={css.VideoPreviewNotice} size="T200">
          {unavailable
            ? `Плеер ${preview.provider} доступен на HTTPS-версии приложения. Видео можно открыть по ссылке ниже.`
            : `Для плеера ${preview.provider} нужно более широкое окно. Видео можно открыть по ссылке ниже.`}
        </Text>
      );
    if (load && !failed && width > 0)
      return (
        <iframe
          className={css.VideoPlayer}
          style={{ minHeight: preview.minimumHeight }}
          src={preview.url}
          title={`Видеоплеер ${preview.provider}`}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
          // YouTube requires the application identity. Send only the origin,
          // never the room/event path or the message's URL query parameters.
          referrerPolicy="strict-origin"
          onLoad={() => onReady?.(true)}
          onError={() => {
            setFailed(true);
            onReady?.(false);
          }}
        />
      );
    return (
      <Button
        size="300"
        variant="Secondary"
        onClick={() => {
          setFailed(false);
          setLoad(true);
        }}
      >
        <Text size="B300">
          {failed ? 'Повторить загрузку' : 'Загрузить видеоплеер'} {preview.provider}
        </Text>
      </Button>
    );
  };
  return (
    <div ref={container} className={css.VideoPreview}>
      {renderPreview()}
    </div>
  );
}
