import React, { ReactNode, useId } from 'react';
import { Box, Text } from 'folds';
import { BreakWord } from '../../styles/Text.css';

type SettingTileProps = {
  title?: ReactNode;
  description?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  children?: ReactNode;
};
export function SettingTile({ title, description, before, after, children }: SettingTileProps) {
  const titleId = useId();
  const descriptionId = useId();
  const control = React.isValidElement(after)
    ? React.cloneElement(after as React.ReactElement, {
        'aria-labelledby': title ? titleId : undefined,
        'aria-describedby': description ? descriptionId : undefined,
      })
    : after;
  return (
    <Box alignItems="Center" gap="300" wrap="Wrap">
      {before && <Box shrink="No">{before}</Box>}
      <Box grow="Yes" direction="Column" gap="100">
        {title && (
          <Text id={titleId} className={BreakWord} size="T300">
            {title}
          </Text>
        )}
        {description && (
          <Text id={descriptionId} className={BreakWord} size="T200" priority="300">
            {description}
          </Text>
        )}
        {children}
      </Box>
      {after && <Box shrink="No">{control}</Box>}
    </Box>
  );
}
