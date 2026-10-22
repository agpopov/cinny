import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const commitMessage = (type, scope, subject, body = '') => {
  if (
    ![
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'perf',
      'test',
      'build',
      'ci',
      'chore',
      'revert',
    ].includes(type)
  )
    throw new Error('Неизвестный тип коммита');
  if (!subject.trim() || /[\r\n]/.test(subject) || /[\r\n()]/.test(scope))
    throw new Error('Проверьте заголовок и область изменения');
  return `${type}${scope ? `(${scope})` : ''}: ${subject.trim()}${
    body.trim() ? `\n\n${body.trim()}` : ''
  }\n`;
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const type = (
      await input.question('Тип (feat/fix/docs/refactor/perf/test/build/ci/chore): ')
    ).trim();
    const scope = (await input.question('Область, необязательно: ')).trim();
    const subject = await input.question('Краткое описание: ');
    const body = await input.question('Подробности, необязательно: ');
    const message = commitMessage(type, scope, subject, body);
    input.close();
    const result = spawnSync('git', ['commit', '--file', '-'], {
      input: message,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    input.close();
    console.error(error.message);
    process.exitCode = 1;
  }
}
