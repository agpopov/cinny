import { t } from 'i18next';
import React from 'react';
import { Box, Icon, Icons, color, Text } from 'folds';

export function FieldError({ message }: { message: string }) {
  return (
    <Box role="alert" style={{ color: color.Critical.Main }} alignItems="Center" gap="100">
      <Icon size="50" filled src={Icons.Warning} />
      <Text size="T200">
        <b>{t(message)}</b>
      </Text>
    </Box>
  );
}
