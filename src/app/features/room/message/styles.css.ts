import { globalStyle, style } from '@vanilla-extract/css';
import { DefaultReset, config, toRem } from 'folds';
import { MessageTextBodyBase } from '../../../components/message/layout/layout.css';
import { tg } from '../../../styles/telegramTheme.css';

export const MessageOptionsTimeSpace = '--cinny-message-options-time-space';

export const MessageBase = style({
  position: 'relative',
  containerType: 'inline-size',
  '@media': {
    '(hover: none)': { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' },
  },
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
    maxWidth: '100%',
    vars: { [MessageOptionsTimeSpace]: '0px' },
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
    paddingInlineEnd: `calc(${config.space.S100} + var(${MessageOptionsTimeSpace}))`,
  },
]);

// The timestamp stays in the header's normal flow and above the floating
// menu background when the shared outline extends around it.
export const MessageTimestamp = style({
  position: 'relative',
  zIndex: 2,
});

export const BubbleAvatarBase = style({
  paddingTop: 0,
});

// The time floats at the end of the last text line and moves below it only
// when that line has no room, like Telegram.
export const BubbleTimeFlow = style({
  display: 'flow-root',
});
globalStyle(`${BubbleTimeFlow} > ${MessageTextBodyBase}`, {
  display: 'inline',
});
export const BubbleTime = style({
  float: 'right',
  marginLeft: config.space.S300,
  marginTop: toRem(6),
  color: tg.bubble.time,
  whiteSpace: 'nowrap',
});

// A thread pane can be narrow even on a large desktop. All quick actions are
// also available from the menu, so show only its button in narrow panes.
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

globalStyle(`${MessageBase} input, ${MessageBase} textarea, ${MessageBase} [contenteditable]`, {
  userSelect: 'text',
  WebkitUserSelect: 'text',
});
