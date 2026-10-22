import { ImagePack } from './ImagePack';
import { PackImageReader } from './PackImageReader';
import { PackImagesReader } from './PackImagesReader';
import { ImageUsage } from './types';
import { builtinStickerManifest } from './builtinStickerManifest';

const stickerKey = (packId: string, stickerId: string) => `builtin-sticker:${packId}/${stickerId}`;

const stickers = new Map(
  builtinStickerManifest.flatMap((pack) =>
    pack.stickers.map((sticker) => [stickerKey(pack.id, sticker.id), sticker] as const)
  )
);

export const getBuiltinSticker = (key: string) => stickers.get(key);

export const getBuiltinStickerAssetUrl = (key: string, basePath: string): string | undefined => {
  const sticker = getBuiltinSticker(key);
  return sticker ? `${basePath.replace(/\/?$/, '/')}${sticker.asset}` : undefined;
};

// Only these bundled, prevalidated readers may use a local sticker key.
// Matrix-provided packs still go through fromPackImage's MXC validation.
export const builtinStickerPacks: ImagePack[] = builtinStickerManifest.map(
  (pack) =>
    new ImagePack(
      `cinny.builtin.stickers.${pack.id}`,
      {
        pack: {
          display_name: pack.name,
          usage: [ImageUsage.Sticker],
          attribution: 'Microsoft Fluent Emoji — MIT',
        },
      },
      undefined,
      PackImagesReader.fromImages(
        pack.stickers.map(
          (sticker) =>
            new PackImageReader(sticker.id, stickerKey(pack.id, sticker.id), {
              body: sticker.label,
              usage: [ImageUsage.Sticker],
              info: sticker.info,
            })
        )
      )
    )
);
