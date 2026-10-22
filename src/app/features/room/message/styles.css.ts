import { globalStyle, style } from '@vanilla-extract/css';
import { DefaultReset, config, toRem } from 'folds';

export const MessageBase = style({
  position: 'relative',
  paddingRight: '44px',
  minHeight: '44px',
  '@media': { '(hover: none)': { userSelect: 'none', WebkitTouchCallout: 'none' } },
});
export const MessageBaseBubbleCollapsed = style({
  paddingTop: 0,
});

export const MessageOptionsBase = style([
  DefaultReset,
  {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 1,
    '@media': {
      '(hover: none), (pointer: coarse)': {
        position: 'absolute',
      },
    },
  },
]);
export const MessageOptionsBar = style([
  DefaultReset,
  {
    padding: config.space.S100,
  },
]);

export const BubbleAvatarBase = style({
  paddingTop: 0,
});

export const MessageAvatar = style({
  cursor: 'pointer',
});

export const MessageQuickReaction = style({
  minWidth: toRem(32),
});

export const MessageMenuGroup = style({
  padding: config.space.S100,
});

export const MessageMenuItemText = style({
  flexGrow: 1,
});

export const ReactionsContainer = style({
  selectors: {
    '&:empty': {
      display: 'none',
    },
  },
});

export const ReactionsTooltipText = style({
  wordBreak: 'break-word',
});

globalStyle(`${MessageOptionsBase}[data-visible="false"] button:not([data-message-actions])`, {
  display: 'none',
});

globalStyle(`${MessageOptionsBase} [data-message-actions]`, {
  minWidth: '44px',
  width: '44px',
  height: '44px',
  padding: '8px',
});

globalStyle(
  `${MessageBase} a, ${MessageBase} input, ${MessageBase} textarea, ${MessageBase} [contenteditable]`,
  { userSelect: 'text' }
);
