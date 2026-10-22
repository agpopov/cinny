import { Box, Text } from 'folds';
import React from 'react';
import { Atom, atom, useAtomValue } from 'jotai';
import * as css from './styles.css';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { getBuiltinStickerAssetUrl } from '../../../plugins/custom-emoji/builtinStickers';

export type PreviewData = {
  key: string;
  shortcode: string;
};

export const createPreviewDataAtom = (initial?: PreviewData) =>
  atom<PreviewData | undefined>(initial);

type PreviewProps = {
  previewAtom: Atom<PreviewData | undefined>;
};
export function Preview({ previewAtom }: PreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const { key, shortcode } = useAtomValue(previewAtom) ?? {};

  if (!shortcode) return null;
  const imageUrl = key
    ? getBuiltinStickerAssetUrl(key, import.meta.env.BASE_URL) ??
      (key.startsWith('mxc://') ? mxcUrlToHttp(mx, key, useAuthentication) : undefined)
    : undefined;

  return (
    <Box shrink="No" className={css.Preview} gap="300" alignItems="Center">
      {key && (
        <Box
          display="InlineFlex"
          className={css.PreviewEmoji}
          alignItems="Center"
          justifyContent="Center"
        >
          {imageUrl ? <img className={css.PreviewImg} src={imageUrl} alt={shortcode} /> : key}
        </Box>
      )}
      <Text size="H5" truncate>
        :{shortcode}:
      </Text>
    </Box>
  );
}
