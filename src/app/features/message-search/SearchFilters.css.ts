import { style } from '@vanilla-extract/css';
import { color, config } from 'folds';

export const SearchField = style({
  display: 'block',
  maxWidth: '100%',
  marginTop: config.space.S100,
  padding: config.space.S200,
  borderRadius: config.radii.R300,
  border: `${config.borderWidth.B300} solid ${color.SurfaceVariant.ContainerLine}`,
  color: color.SurfaceVariant.OnContainer,
  background: color.SurfaceVariant.Container,
  font: 'inherit',
  ':focus-visible': { outline: `${config.borderWidth.B600} solid ${color.Primary.Main}` },
});
