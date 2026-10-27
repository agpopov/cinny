import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { style } from '@vanilla-extract/css';
import { color, toRem } from 'folds';

export const PanelResizable = style({
  position: 'relative',
});

// Drag handle on a panel edge: only the cursor changes on hover,
// a line is shown for keyboard focus.
export const PanelResizer = recipe({
  base: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: toRem(6),
    zIndex: 1,
    cursor: 'col-resize',
    touchAction: 'none',
    outline: 'none',
    selectors: {
      '&:focus-visible::after': {
        content: '""',
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: toRem(2),
        width: toRem(2),
        backgroundColor: `color-mix(in srgb, ${color.Background.OnContainer} 25%, transparent)`,
      },
    },
  },
  variants: {
    edge: {
      Left: { left: toRem(-3) },
      Right: { right: toRem(-3) },
    },
  },
});
export type PanelResizerVariants = RecipeVariants<typeof PanelResizer>;
