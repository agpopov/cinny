import { globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import { EditorTextarea } from '../../../components/editor/Editor.css';

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

export const NewThreadButton = style({ marginLeft: 'auto' });

export const CreateBody = style({ minHeight: 0 });

export const CreateContent = style({
  padding: `${config.space.S600} ${config.space.S400} ${config.space.S500}`,
  gap: config.space.S300,
  minWidth: 0,
});

export const CreateIcon = style({
  display: 'grid',
  placeItems: 'center',
  width: toRem(72),
  height: toRem(72),
  marginBottom: config.space.S200,
  borderRadius: '50%',
  background: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
});

export const CreateDescription = style({ lineHeight: 1.5, overflowWrap: 'anywhere' });
export const CreateField = style({ marginTop: config.space.S400, minWidth: 0 });
export const CreateLabel = style({
  textTransform: 'uppercase',
  letterSpacing: '0.025em',
  fontWeight: 700,
});
export const Required = style({ color: color.Critical.Main });
export const CreateTitleInput = style({ width: '100%' });

export const CreateEditor = style({
  borderRadius: config.radii.R400,
  backgroundColor: color.SurfaceVariant.Container,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  overflow: 'hidden',
  selectors: {
    '&:focus-within': {
      outline: `${toRem(2)} solid ${color.Primary.Main}`,
      outlineOffset: toRem(1),
    },
  },
});

// A roomy first-message field, matching Discord's thread creation panel.
globalStyle(`${CreateEditor} ${EditorTextarea}`, { minHeight: toRem(136) });

export const CreateEditorBar = style({ padding: `${config.space.S100} ${config.space.S200}` });
export const CreateError = style({ color: color.Critical.Main, overflowWrap: 'anywhere' });
export const CreateFooter = style({
  flexShrink: 0,
  marginTop: 'auto',
  padding: config.space.S400,
  borderTop: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
  backgroundColor: color.Background.Container,
});
export const CreateButton = style({
  backgroundColor: '#5865f2',
  color: '#fff',
  selectors: {
    '&:enabled:hover': { backgroundColor: '#4752c4' },
    '&:enabled:active': { backgroundColor: '#3c45a5' },
    '&:disabled': { opacity: 0.5 },
  },
});
