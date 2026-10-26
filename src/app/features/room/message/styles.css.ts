import { globalStyle, style } from '@vanilla-extract/css';
import { DefaultReset, config, toRem } from 'folds';

export const MessageBase = style({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  columnGap: config.space.S200,
  containerType: 'inline-size',
  '@media': {
    '(hover: none)': { userSelect: 'none', WebkitTouchCallout: 'none' },
  },
});
export const MessageBaseBubbleCollapsed = style({
  paddingTop: 0,
});

export const MessageOptionsBase = style([
  DefaultReset,
  {
    position: 'relative',
    gridColumn: 2,
    gridRow: 1,
    alignSelf: 'start',
    zIndex: 1,
    opacity: 0,
    pointerEvents: 'none',
    selectors: {
      '&[data-visible="true"]': {
        opacity: 1,
        pointerEvents: 'auto',
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

// Keep the action column reserved even while hidden: dates, text and images
// retain their width when a mouse or keyboard reveals the buttons.
globalStyle(`${MessageBase} > :not(${MessageOptionsBase})`, {
  gridColumn: 1,
  gridRow: 1,
  minWidth: 0,
});

// A thread pane can be narrow even on a large desktop. All quick actions are
// also available from the menu, so reserve only its button in narrow panes.
globalStyle(`${MessageOptionsBase} button:not([data-message-actions])`, {
  '@container': {
    '(max-width: 600px)': { display: 'none' },
  },
  '@media': {
    '(hover: none), (pointer: coarse)': { display: 'none' },
  },
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

globalStyle(`${MessageOptionsBase} [data-message-actions]`, {
  '@media': {
    '(hover: none), (pointer: coarse)': {
      minWidth: toRem(44),
      width: toRem(44),
      height: toRem(44),
      padding: config.space.S200,
    },
  },
});

globalStyle(
  `${MessageBase} a, ${MessageBase} input, ${MessageBase} textarea, ${MessageBase} [contenteditable]`,
  { userSelect: 'text' }
);
