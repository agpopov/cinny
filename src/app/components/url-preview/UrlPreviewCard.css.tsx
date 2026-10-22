import { recipe } from '@vanilla-extract/recipes';
import { style } from '@vanilla-extract/css';
import { DefaultReset, color, toRem } from 'folds';

export const PreviewMedia = style({
  display: 'block',
  width: '100%',
  maxHeight: toRem(400),
  objectFit: 'contain',
});

export const PreviewImageButton = style([
  DefaultReset,
  {
    display: 'block',
    width: '100%',
    border: 0,
    padding: 0,
    background: 'transparent',
    cursor: 'pointer',
  },
]);

export const ProviderEmbed = style({
  display: 'block',
  width: '100%',
  aspectRatio: '1 / 1',
  border: 0,
});

export const VideoPreview = style({
  width: '100%',
  minWidth: 0,
});

export const VideoPlayer = style({
  display: 'block',
  width: '100%',
  aspectRatio: '16 / 9',
  border: 0,
});

export const VideoPreviewNotice = style({ padding: toRem(12) });

export const UrlPreviewHolderGradient = recipe({
  base: [
    DefaultReset,
    {
      position: 'absolute',
      height: '100%',
      width: toRem(10),
      zIndex: 1,
    },
  ],
  variants: {
    position: {
      Left: {
        left: 0,
        background: `linear-gradient(to right,${color.Surface.Container} , rgba(116,116,116,0))`,
      },
      Right: {
        right: 0,
        background: `linear-gradient(to left,${color.Surface.Container} , rgba(116,116,116,0))`,
      },
    },
  },
});
export const UrlPreviewHolderBtn = recipe({
  base: [
    DefaultReset,
    {
      position: 'absolute',
      zIndex: 1,
    },
  ],
  variants: {
    position: {
      Left: {
        left: 0,
        transform: 'translateX(-25%)',
      },
      Right: {
        right: 0,
        transform: 'translateX(25%)',
      },
    },
  },
});
