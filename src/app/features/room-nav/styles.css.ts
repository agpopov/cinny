import { style } from '@vanilla-extract/css';
import { DefaultReset, FocusOutline, color, config, toRem } from 'folds';

export const CategoryButton = style({
  flexGrow: 1,
});
export const CategoryButtonIcon = style({
  opacity: config.opacity.P400,
});

export const RoomName = style({ fontWeight: config.fontWeight.W600 });

export const ThreadName = style({
  fontWeight: config.fontWeight.W400,
  selectors: { '&[data-unread=true]': { fontWeight: config.fontWeight.W500 } },
});

export const ThreadList = style({
  position: 'relative',
  '::before': {
    content: '""',
    position: 'absolute',
    top: toRem(4),
    bottom: toRem(4),
    left: toRem(16),
    width: toRem(1),
    backgroundColor: color.Background.ContainerLine,
    pointerEvents: 'none',
  },
});

export const ThreadsMoreButton = style([
  DefaultReset,
  FocusOutline,
  {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: `calc(100% - ${config.space.S500})`,
    minHeight: toRem(24),
    marginLeft: config.space.S500,
    padding: `0 ${config.space.S200}`,
    borderRadius: config.radii.R300,
    color: color.Background.OnContainer,
    opacity: config.opacity.P300,
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': {
      opacity: config.opacity.P500,
    },
    ':focus-visible': {
      opacity: config.opacity.P500,
    },
  },
]);
