import assert from 'node:assert/strict';
import { test } from 'node:test';
import './register-unread-source.mjs';
const { formattedMessageText } = await import('../src/app/utils/messagePreview.ts');

test('notification HTML renders headings, breaks, lists and tables as readable text', () => {
  assert.equal(
    formattedMessageText(
      '<h4><span data-mx-color="#e74c3c">[FIRING:7]</span></h4><p>⚠️ FluentBitHighRetries<br>📝 High number of retries<br>📖 Fluent Bit is down</p>'
    ),
    '[FIRING:7]\n\n⚠️ FluentBitHighRetries\n📝 High number of retries\n📖 Fluent Bit is down'
  );
  assert.equal(
    formattedMessageText('<ul><li>First</li><li>Second &amp; third</li></ul>'),
    '• First\n• Second & third'
  );
  assert.equal(
    formattedMessageText(
      '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>'
    ),
    'A B\n\nC D'
  );
});

test('notification text keeps link labels, mention names and custom emoji descriptions', () => {
  assert.equal(
    formattedMessageText(
      '<p>Hello <a href="https://matrix.to/#/@user:example.org">Alice</a>, read <a href="https://example.org">the guide</a> <img src="mxc://example.org/smile" alt=":smile:" data-mx-emoticon></p>'
    ),
    'Hello Alice, read the guide :smile:'
  );
});

test('reply fallbacks, active HTML and spoiler contents do not leak into notifications', () => {
  assert.equal(
    formattedMessageText(
      '<mx-reply><blockquote>Old quoted message</blockquote></mx-reply><p>Actual reply <span data-mx-spoiler>secret</span></p><script>bad()</script><style>hidden</style>'
    ),
    'Actual reply [Спойлер]'
  );
  assert.equal(
    formattedMessageText('<pre><code>&lt;h4&gt;literal code&lt;/h4&gt;</code></pre>'),
    '<h4>literal code</h4>'
  );
});
