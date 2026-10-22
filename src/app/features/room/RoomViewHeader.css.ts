import { globalStyle, style } from '@vanilla-extract/css';
import { config } from 'folds';

export const HeaderTopic = style({
  ':hover': {
    cursor: 'pointer',
    opacity: config.opacity.P500,
    textDecoration: 'underline',
  },
});

export const MobileHeader = style({});
globalStyle(`${MobileHeader} button:not(.${HeaderTopic})`, {
  minWidth: '44px',
  width: '44px',
  height: '44px',
  padding: '8px',
  flexShrink: 0,
});
globalStyle(`${MobileHeader} svg`, { width: '24px', height: '24px' });
