import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Poll = style({
  width: '100%',
  maxWidth: toRem(420),
  minWidth: 0,
  padding: config.space.S300,
  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  color: color.SurfaceVariant.OnContainer,
});

export const Answer = style({
  position: 'relative',
  display: 'block',
  width: '100%',
  padding: `${config.space.S200} ${config.space.S300}`,
  overflow: 'hidden',
  textAlign: 'left',
  cursor: 'pointer',
  color: 'inherit',
  borderRadius: config.radii.R300,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  backgroundColor: color.Surface.Container,
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: color.Surface.ContainerHover,
    },
    '&:disabled': {
      cursor: 'default',
    },
    '&[aria-checked=true]': {
      borderColor: color.Primary.Main,
    },
  },
});

export const AnswerBar = style({
  position: 'absolute',
  inset: 0,
  right: 'auto',
  backgroundColor: color.Primary.Container,
  opacity: 0.6,
  transition: 'width 200ms ease',
  pointerEvents: 'none',
});

export const AnswerBarWinner = style({
  backgroundColor: color.Primary.Main,
  opacity: 0.25,
});

export const AnswerRow = style({
  position: 'relative',
  minWidth: 0,
});

export const Marker = style({
  width: toRem(16),
  height: toRem(16),
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `${config.borderWidth.B400} solid ${color.SurfaceVariant.OnContainer}`,
  color: color.Primary.OnMain,
  selectors: {
    '&[data-checked=true]': {
      backgroundColor: color.Primary.Main,
      borderColor: color.Primary.Main,
    },
  },
});

export const MarkerRadio = style({ borderRadius: '50%' });
export const MarkerCheck = style({ borderRadius: config.radii.R300 });

export const AnswerText = style({
  minWidth: 0,
  overflowWrap: 'anywhere',
});
