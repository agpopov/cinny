import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Summary = style({
  marginTop: config.space.S200,
  padding: `${config.space.S100} ${config.space.S300}`,
  maxWidth: toRem(520),
  minWidth: 0,
  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  color: color.SurfaceVariant.OnContainer,
  cursor: 'pointer',
  textAlign: 'left',
  selectors: {
    '&:hover, &:focus-visible': {
      backgroundColor: color.SurfaceVariant.ContainerHover,
    },
  },
});

export const SummaryCount = style({
  color: color.Primary.Main,
  flexShrink: 0,
});

export const SummaryPreview = style({
  minWidth: 0,
  opacity: config.opacity.P400,
});

export const UnreadDot = style({
  width: toRem(8),
  height: toRem(8),
  borderRadius: '50%',
  flexShrink: 0,
  backgroundColor: color.Primary.Main,
});

export const UnreadDotHighlight = style({
  backgroundColor: color.Critical.Main,
});

export const Panel = style({
  width: toRem(420),
  minWidth: 0,
  flexShrink: 0,
  backgroundColor: color.Background.Container,
  color: color.Background.OnContainer,
});

export const PanelMobile = style({
  width: '100%',
  flexGrow: 1,
});

export const PanelHeader = style({
  padding: `0 ${config.space.S200} 0 ${config.space.S300}`,
  flexShrink: 0,
  borderBottomWidth: config.borderWidth.B300,
});

export const ListItem = style({
  padding: config.space.S300,
  borderRadius: config.radii.R400,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  backgroundColor: 'transparent',
  color: 'inherit',
  border: 'none',
  selectors: {
    '&:hover, &:focus-visible': {
      backgroundColor: color.Background.ContainerHover,
    },
  },
});

export const ListItemRootText = style({
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
});

export const FilterBar = style({
  padding: `${config.space.S200} ${config.space.S300}`,
  flexShrink: 0,
});
