import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

const roomTypes = new URL('../src/types/matrix/room.ts', import.meta.url).href;
const constantsFixture = new URL('./fixtures/room-constants.mjs', import.meta.url).href;

// Native type stripping only: no generated JavaScript or compiler invocation.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (candidate.href.endsWith('/src/app/components/editor/types.ts'))
        return nextResolve(new URL('./fixtures/editor-types.mjs', import.meta.url).href, context);
      const directory = new URL(`${specifier}/index.ts`, context.parentURL);
      if (existsSync(directory)) return nextResolve(directory.href, context);
      if (candidate.href === roomTypes) return nextResolve(constantsFixture, context);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
});
