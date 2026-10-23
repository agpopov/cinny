import { t } from 'i18next';
import React from 'react';
import { Box, toRem, config, Icons, Icon, Text } from 'folds';

export function NoStickerPacks() {
  return (
    <Box
      style={{ padding: `${toRem(60)} ${config.space.S500}` }}
      alignItems="Center"
      justifyContent="Center"
      direction="Column"
      gap="300"
    >
      <Icon size="600" src={Icons.Sticker} />
      <Box direction="Inherit">
        <Text align="Center">{t('No Sticker Packs!')}</Text>
        <Text priority="300" align="Center" size="T200">
          {t('Add stickers from user, room or space settings.')}
        </Text>
      </Box>
    </Box>
  );
}
