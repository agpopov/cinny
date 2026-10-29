import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config } from 'folds';

// Informational line after the last message, in the timeline flow.
export const RoomViewTyping = style([
  DefaultReset,
  {
    padding: `${config.space.S100} ${config.space.S500}`,
    color: color.Surface.OnContainer,
  },
]);
export const TypingText = style({
  flexGrow: 1,
});
