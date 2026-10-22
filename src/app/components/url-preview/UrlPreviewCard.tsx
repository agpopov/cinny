import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IPreviewUrlResponse } from 'matrix-js-sdk';
import {
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Scroll,
  Spinner,
  Text,
  as,
  color,
  config,
} from 'folds';
import { ImageOverlay } from '../ImageOverlay';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { UrlPreview, UrlPreviewContent, UrlPreviewDescription } from './UrlPreview';
import {
  getIntersectionObserverEntry,
  useIntersectionObserver,
} from '../../hooks/useIntersectionObserver';
import * as css from './UrlPreviewCard.css';
import { tryDecodeURIComponent } from '../../utils/dom';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { ImageViewer } from '../image-viewer';
import { getDirectMedia, getHttpUrl, getPreviewMedia } from '../../utils/urlPreview';

const linkStyles = { color: color.Success.Main };

type PreviewMediaProps = {
  src: string;
  poster?: string;
  kind: 'image' | 'video';
  title: string;
  autoLoad?: boolean;
};

function PreviewMedia({ src, poster, kind, title, autoLoad }: PreviewMediaProps) {
  const [load, setLoad] = useState(!!autoLoad);
  const [error, setError] = useState(false);
  const [viewer, setViewer] = useState(false);

  if (error) {
    return (
      <Button
        size="300"
        variant="Secondary"
        onClick={() => {
          setError(false);
          setLoad(true);
        }}
      >
        <Text size="B300">Retry media preview</Text>
      </Button>
    );
  }
  if (!load) {
    return (
      <Button size="300" variant="Secondary" onClick={() => setLoad(true)}>
        <Text size="B300">Load media preview</Text>
      </Button>
    );
  }
  return kind === 'video' ? (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      className={css.PreviewMedia}
      src={src}
      poster={poster}
      title={title}
      controls
      playsInline
      preload="metadata"
      onError={() => setError(true)}
    />
  ) : (
    <>
      <button
        type="button"
        className={css.PreviewImageButton}
        onClick={() => setViewer(true)}
        aria-label={title}
      >
        <img
          className={css.PreviewMedia}
          src={src}
          alt={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setError(true)}
        />
      </button>
      <ImageOverlay
        src={src}
        alt={title}
        viewer={viewer}
        requestClose={() => setViewer(false)}
        renderViewer={(p) => <ImageViewer {...p} />}
      />
    </>
  );
}

export const UrlPreviewCard = as<'div', { url: string; ts: number; mediaAutoLoad?: boolean }>(
  ({ url, ts, mediaAutoLoad = true, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const directMedia = getDirectMedia(url);
    const safeUrl = getHttpUrl(url);
    const [previewStatus, loadPreview] = useAsyncCallback(
      useCallback(() => mx.getUrlPreview(url, ts), [url, ts, mx])
    );

    useEffect(() => {
      if (safeUrl && !getDirectMedia(url)) {
        // The hook exposes the error state; consume the rejected promise as well.
        loadPreview().catch(() => undefined);
      }
    }, [loadPreview, safeUrl, url]);

    if (!safeUrl || (!directMedia && previewStatus.status === AsyncStatus.Error)) return null;

    const renderContent = (prev?: IPreviewUrlResponse) => {
      const image = prev?.['og:image'];
      const imgUrl =
        typeof image === 'string'
          ? mxcUrlToHttp(mx, image, useAuthentication) ?? getHttpUrl(image)
          : undefined;
      const media = directMedia ?? (prev && getPreviewMedia(prev));
      const src = media?.url ?? imgUrl;
      const title = typeof prev?.['og:title'] === 'string' ? prev['og:title'] : 'Media preview';

      return (
        <>
          {src && (
            <PreviewMedia
              key={src}
              src={src}
              kind={media?.kind ?? 'image'}
              poster={imgUrl ?? undefined}
              title={title}
              autoLoad={mediaAutoLoad}
            />
          )}
          <UrlPreviewContent>
            <Text
              style={linkStyles}
              truncate
              as="a"
              href={safeUrl}
              target="_blank"
              rel="noreferrer noopener"
              size="T200"
              priority="300"
            >
              {typeof prev?.['og:site_name'] === 'string' && `${prev['og:site_name']} | `}
              {tryDecodeURIComponent(url)}
            </Text>
            {typeof prev?.['og:title'] === 'string' && (
              <Text truncate priority="400">
                <b>{prev['og:title']}</b>
              </Text>
            )}
            {typeof prev?.['og:description'] === 'string' && (
              <Text size="T200" priority="300">
                <UrlPreviewDescription>{prev['og:description']}</UrlPreviewDescription>
              </Text>
            )}
          </UrlPreviewContent>
        </>
      );
    };

    let previewContent = (
      <Box grow="Yes" alignItems="Center" justifyContent="Center">
        <Spinner variant="Secondary" size="400" />
      </Box>
    );
    if (directMedia) previewContent = renderContent();
    else if (previewStatus.status === AsyncStatus.Success)
      previewContent = renderContent(previewStatus.data);

    return (
      <UrlPreview {...props} ref={ref}>
        {previewContent}
      </UrlPreview>
    );
  }
);

export const UrlPreviewHolder = as<'div'>(({ children, ...props }, ref) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const backAnchorRef = useRef<HTMLDivElement>(null);
  const frontAnchorRef = useRef<HTMLDivElement>(null);
  const [backVisible, setBackVisible] = useState(true);
  const [frontVisible, setFrontVisible] = useState(true);

  const intersectionObserver = useIntersectionObserver(
    useCallback((entries) => {
      const backAnchor = backAnchorRef.current;
      const frontAnchor = frontAnchorRef.current;
      const backEntry = backAnchor && getIntersectionObserverEntry(backAnchor, entries);
      const frontEntry = frontAnchor && getIntersectionObserverEntry(frontAnchor, entries);
      if (backEntry) {
        setBackVisible(backEntry.isIntersecting);
      }
      if (frontEntry) {
        setFrontVisible(frontEntry.isIntersecting);
      }
    }, []),
    useCallback(
      () => ({
        root: scrollRef.current,
        rootMargin: '10px',
      }),
      []
    )
  );

  useEffect(() => {
    const backAnchor = backAnchorRef.current;
    const frontAnchor = frontAnchorRef.current;
    if (backAnchor) intersectionObserver?.observe(backAnchor);
    if (frontAnchor) intersectionObserver?.observe(frontAnchor);
    return () => {
      if (backAnchor) intersectionObserver?.unobserve(backAnchor);
      if (frontAnchor) intersectionObserver?.unobserve(frontAnchor);
    };
  }, [intersectionObserver]);

  const handleScrollBack = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { offsetWidth, scrollLeft } = scroll;
    scroll.scrollTo({
      left: scrollLeft - offsetWidth / 1.3,
      behavior: 'smooth',
    });
  };
  const handleScrollFront = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const { offsetWidth, scrollLeft } = scroll;
    scroll.scrollTo({
      left: scrollLeft + offsetWidth / 1.3,
      behavior: 'smooth',
    });
  };

  return (
    <Box
      direction="Column"
      {...props}
      ref={ref}
      style={{ marginTop: config.space.S200, position: 'relative' }}
    >
      <Scroll ref={scrollRef} direction="Horizontal" size="0" visibility="Hover" hideTrack>
        <Box shrink="No" alignItems="Center">
          <div ref={backAnchorRef} />
          {!backVisible && (
            <>
              <div className={css.UrlPreviewHolderGradient({ position: 'Left' })} />
              <IconButton
                className={css.UrlPreviewHolderBtn({ position: 'Left' })}
                variant="Secondary"
                radii="Pill"
                size="300"
                outlined
                onClick={handleScrollBack}
              >
                <Icon size="300" src={Icons.ArrowLeft} />
              </IconButton>
            </>
          )}
          <Box alignItems="Inherit" gap="200">
            {children}

            {!frontVisible && (
              <>
                <div className={css.UrlPreviewHolderGradient({ position: 'Right' })} />
                <IconButton
                  className={css.UrlPreviewHolderBtn({ position: 'Right' })}
                  variant="Primary"
                  radii="Pill"
                  size="300"
                  outlined
                  onClick={handleScrollFront}
                >
                  <Icon size="300" src={Icons.ArrowRight} />
                </IconButton>
              </>
            )}
            <div ref={frontAnchorRef} />
          </Box>
        </Box>
      </Scroll>
    </Box>
  );
});
