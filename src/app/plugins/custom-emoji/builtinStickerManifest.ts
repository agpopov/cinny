// Bundled, unmodified Fluent Emoji 3D artwork by Microsoft (MIT).
// Upstream revision and per-file integrity are recorded in public/res/stickers/SOURCES.json.
export type BuiltinSticker = {
  id: string;
  label: string;
  asset: string;
  info: { w: number; h: number; mimetype: string; size: number };
};
export type BuiltinStickerPack = { id: string; name: string; stickers: BuiltinSticker[] };

export const builtinStickerManifest: BuiltinStickerPack[] = [
  {
    id: 'cats',
    name: 'Коты',
    stickers: [
      {
        id: 'cat_face',
        label: 'Котик',
        asset: 'public/stickers/cats/cat_face.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 37653,
        },
      },
      {
        id: 'cat_smile',
        label: 'Кот улыбается',
        asset: 'public/stickers/cats/cat_smile.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 37653,
        },
      },
      {
        id: 'cat_happy',
        label: 'Кот радуется',
        asset: 'public/stickers/cats/cat_happy.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 39090,
        },
      },
      {
        id: 'cat_laugh',
        label: 'Кот смеётся до слёз',
        asset: 'public/stickers/cats/cat_laugh.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 41847,
        },
      },
      {
        id: 'cat_love',
        label: 'Влюблённый кот',
        asset: 'public/stickers/cats/cat_love.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 43380,
        },
      },
      {
        id: 'cat_kiss',
        label: 'Кот целует',
        asset: 'public/stickers/cats/cat_kiss.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 41893,
        },
      },
      {
        id: 'cat_smirk',
        label: 'Хитрый кот',
        asset: 'public/stickers/cats/cat_smirk.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 39551,
        },
      },
      {
        id: 'cat_cry',
        label: 'Кот плачет',
        asset: 'public/stickers/cats/cat_cry.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 39555,
        },
      },
      {
        id: 'cat_angry',
        label: 'Сердитый кот',
        asset: 'public/stickers/cats/cat_angry.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 39284,
        },
      },
      {
        id: 'cat_shock',
        label: 'Кот в шоке',
        asset: 'public/stickers/cats/cat_shock.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 36246,
        },
      },
      {
        id: 'cat',
        label: 'Кошка',
        asset: 'public/stickers/cats/cat.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 33603,
        },
      },
      {
        id: 'cat_black',
        label: 'Чёрный кот',
        asset: 'public/stickers/cats/cat_black.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 32580,
        },
      },
    ],
  },
  {
    id: 'reactions',
    name: 'Реакции',
    stickers: [
      {
        id: 'laugh',
        label: 'Смешно до слёз',
        asset: 'public/stickers/reactions/laugh.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 44153,
        },
      },
      {
        id: 'rofl',
        label: 'Катаюсь от смеха',
        asset: 'public/stickers/reactions/rofl.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 45925,
        },
      },
      {
        id: 'think',
        label: 'Думаю',
        asset: 'public/stickers/reactions/think.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 45573,
        },
      },
      {
        id: 'melt',
        label: 'Плавлюсь',
        asset: 'public/stickers/reactions/melt.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 41542,
        },
      },
      {
        id: 'eyeroll',
        label: 'Закатываю глаза',
        asset: 'public/stickers/reactions/eyeroll.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 33793,
        },
      },
      {
        id: 'oops',
        label: 'Ой, неловко',
        asset: 'public/stickers/reactions/oops.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 44456,
        },
      },
      {
        id: 'cry',
        label: 'Рыдаю',
        asset: 'public/stickers/reactions/cry.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 38405,
        },
      },
      {
        id: 'mind_blown',
        label: 'Взрыв мозга',
        asset: 'public/stickers/reactions/mind_blown.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 47230,
        },
      },
      {
        id: 'cool',
        label: 'Круто',
        asset: 'public/stickers/reactions/cool.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 47859,
        },
      },
      {
        id: 'disguise',
        label: 'Инкогнито',
        asset: 'public/stickers/reactions/disguise.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 49564,
        },
      },
      {
        id: 'shush',
        label: 'Тихо',
        asset: 'public/stickers/reactions/shush.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 41453,
        },
      },
      {
        id: 'sleep',
        label: 'Сплю',
        asset: 'public/stickers/reactions/sleep.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 44597,
        },
      },
      {
        id: 'vomit',
        label: 'Тошнит',
        asset: 'public/stickers/reactions/vomit.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 46439,
        },
      },
      {
        id: 'dead',
        label: 'Умер со смеху',
        asset: 'public/stickers/reactions/dead.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 32764,
        },
      },
      {
        id: 'poop',
        label: 'Ну и дела',
        asset: 'public/stickers/reactions/poop.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 35754,
        },
      },
      {
        id: 'clown',
        label: 'Клоун',
        asset: 'public/stickers/reactions/clown.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 62705,
        },
      },
      {
        id: 'eyes',
        label: 'Смотрю, интересно',
        asset: 'public/stickers/reactions/eyes.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 38982,
        },
      },
      {
        id: 'fire',
        label: 'Огонь',
        asset: 'public/stickers/reactions/fire.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 26826,
        },
      },
      {
        id: 'party',
        label: 'Вечеринка',
        asset: 'public/stickers/reactions/party.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 50583,
        },
      },
      {
        id: 'celebrate',
        label: 'Поздравляю',
        asset: 'public/stickers/reactions/celebrate.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 42512,
        },
      },
    ],
  },
  {
    id: 'animals',
    name: 'Зверята',
    stickers: [
      {
        id: 'fox',
        label: 'Лиса',
        asset: 'public/stickers/animals/fox.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 41966,
        },
      },
      {
        id: 'dog',
        label: 'Собака',
        asset: 'public/stickers/animals/dog.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 43188,
        },
      },
      {
        id: 'panda',
        label: 'Панда',
        asset: 'public/stickers/animals/panda.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 43603,
        },
      },
      {
        id: 'rabbit',
        label: 'Кролик',
        asset: 'public/stickers/animals/rabbit.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 31679,
        },
      },
      {
        id: 'bear',
        label: 'Медведь',
        asset: 'public/stickers/animals/bear.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 41872,
        },
      },
      {
        id: 'teddy',
        label: 'Плюшевый мишка',
        asset: 'public/stickers/animals/teddy.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 44142,
        },
      },
      {
        id: 'frog',
        label: 'Лягушка',
        asset: 'public/stickers/animals/frog.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 38651,
        },
      },
      {
        id: 'hamster',
        label: 'Хомяк',
        asset: 'public/stickers/animals/hamster.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 37781,
        },
      },
      {
        id: 'mouse',
        label: 'Мышка',
        asset: 'public/stickers/animals/mouse.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 34704,
        },
      },
      {
        id: 'raccoon',
        label: 'Енот',
        asset: 'public/stickers/animals/raccoon.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 38434,
        },
      },
      {
        id: 'koala',
        label: 'Коала',
        asset: 'public/stickers/animals/koala.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 36244,
        },
      },
      {
        id: 'otter',
        label: 'Выдра',
        asset: 'public/stickers/animals/otter.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 33767,
        },
      },
      {
        id: 'penguin',
        label: 'Пингвин',
        asset: 'public/stickers/animals/penguin.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 32955,
        },
      },
      {
        id: 'unicorn',
        label: 'Единорог',
        asset: 'public/stickers/animals/unicorn.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 35413,
        },
      },
      {
        id: 'sloth',
        label: 'Ленивец',
        asset: 'public/stickers/animals/sloth.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 38149,
        },
      },
      {
        id: 'duck',
        label: 'Утка',
        asset: 'public/stickers/animals/duck.png',
        info: {
          w: 256,
          h: 256,
          mimetype: 'image/png',
          size: 32162,
        },
      },
    ],
  },
];
