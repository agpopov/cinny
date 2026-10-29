// Render the installed Input and evaluate source CSS as data. No compiler or app build.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, writeFileSync } from 'node:fs';
import { Input, color, config, configClass, varsClass, lightTheme, toRem } from 'folds';
import { sourceModule } from './composer-source.mjs';

const rules = [];
let index = 0;
const style = (styles) => {
  const name = `threadProbe${index++}`;
  rules.push({ selector: `.${name}`, styles });
  return name;
};
const globalStyle = (selector, styles) =>
  rules.push({ selector: selector.replace(/\bthreadProbe\d+\b/g, '.$&'), styles });
const styles = new Function(
  'style',
  'globalStyle',
  'color',
  'config',
  'toRem',
  'EditorTextarea',
  `${sourceModule(
    '../../src/app/features/room/thread/Thread.css.ts'
  )}; return { CreateTitleInput };`
)(style, globalStyle, color, config, toRem, 'sourceTextarea');
const themes = {};
const createTheme = (contract, tokens) => {
  const name = `themeProbe${index++}`;
  const variables = {};
  const visit = (references, values) => {
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'object') visit(references[key], value);
      else variables[references[key].slice(4, -1)] = value;
    }
  };
  visit(contract, tokens);
  rules.push({ selector: `.${name}`, styles: variables });
  return name;
};
const custom = new Function(
  'createTheme',
  'color',
  `${sourceModule(
    '../../src/colors.css.ts'
  )}; return { silverTheme, darkTheme, butterTheme, telegramTheme, telegramDarkTheme };`
)(createTheme, color);
Object.assign(themes, {
  'light-theme': lightTheme,
  'silver-theme': custom.silverTheme,
  'telegram-theme': custom.telegramTheme,
  'dark-theme': custom.darkTheme,
  'butter-theme': custom.butterTheme,
  'telegram-dark-theme': custom.telegramDarkTheme,
});
const title = renderToStaticMarkup(
  React.createElement(Input, {
    id: 'title',
    className: styles.CreateTitleInput,
    value: 'Тест треда',
    readOnly: true,
    variant: 'SurfaceVariant',
    size: '400',
    radii: '300',
  })
);
const control = renderToStaticMarkup(
  React.createElement(Input, { id: 'control', readOnly: true, value: 'Другое поле' })
);
writeFileSync(
  '/tmp/cinny-thread-title-source.json',
  JSON.stringify({
    rules,
    themes,
    bodyClass: `${configClass} ${varsClass}`,
    html: `<label for="title">Название треда</label>${title}<p>Проверка общего стиля фокуса:</p>${control}`,
    folds: readFileSync(
      new URL('../../node_modules/folds/dist/style.css', import.meta.url),
      'utf8'
    ),
    global: readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8'),
  })
);
