import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditor, Editor, type Descendant, Transforms } from 'slate';
import parse from 'html-dom-parser';
import { Element } from 'domhandler';
import { createClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { getMentions, toMatrixCustomHTML, toPlainText } from '../src/app/components/editor/output';
import { htmlToEditorInput } from '../src/app/components/editor/input';
import { createMentionElement, getPrevWordRange } from '../src/app/components/editor/utils';
import {
  getAutocompleteQuery,
  AUTOCOMPLETE_PREFIXES,
} from '../src/app/components/editor/autocomplete/autocompleteQuery';
import { BlockType } from '../src/app/components/editor/types';
import {
  type GroupMention,
  MENTION_GROUP_EVENT,
  assertMentionContentSize,
  decodeGroupMention,
  createMentionGroupId,
  freshGroupMentionNodes,
  getResolvedGroup,
  getRoomMentionGroups,
  groupMentionHtml,
  groupMentionKey,
  groupMentionText,
  normalizeGroupName,
  parseMentionGroup,
  resolveGroupMentions,
  validGroupName,
} from '../src/app/utils/mentionGroups';
import { readGroupMentionNode } from '../src/app/utils/groupMentionHtml';
import { sanitizeCustomHtml } from '../src/app/utils/sanitize';
import { mentionQueryStart } from '../src/app/utils/mentionQuery';

const me = '@alice:test';
const bob = '@bob:test';
const carol = '@carol:test';
const dave = '@dave:test';
let seq = 0;
function fixture() {
  const mx = createClient({ baseUrl: 'https://test.invalid', userId: me });
  const state = (room: Room, type: string, key: string, content: object) =>
    room.currentState.setStateEvents([
      new MatrixEvent({
        type,
        state_key: key,
        room_id: room.roomId,
        event_id: `$${++seq}`,
        sender: me,
        content,
      }),
    ]);
  const makeRoom = (id: string, space = false) => {
    const room = new Room(id, mx, me);
    mx.store.storeRoom(room);
    room.loadMembersIfNeeded = async () => false;
    state(room, 'm.room.create', '', { creator: me, ...(space && { type: 'm.space' }) });
    return room;
  };
  const member = (room: Room, id: string, membership = 'join') =>
    state(room, 'm.room.member', id, { membership, displayname: id.slice(1).split(':')[0] });
  const space = makeRoom('!space:test', true);
  const room = makeRoom('!room:test');
  [me, bob, carol, dave].forEach((id) => member(space, id));
  [me, bob, carol].forEach((id) => member(room, id));
  space.updateMyMembership('join');
  room.updateMyMembership('join');
  state(space, 'm.space.child', room.roomId, { via: ['test'] });
  const group = (id: string, name: string, ids: string[]) => {
    state(space, MENTION_GROUP_EVENT, id, { name, color: '#5865f2', user_ids: ids });
    return { id, name, spaceId: space.roomId, color: '#5865f2' } satisfies GroupMention;
  };
  return { mx, room, space, group, state, member, makeRoom };
}
const pill = (group: GroupMention) => ({
  ...createMentionElement(group.id, `@${group.name}`, false),
  group,
});
const paragraph = (children: any[]): Descendant => ({ type: BlockType.Paragraph, children });
const editorFor = (nodes: Descendant[]) => {
  const editor = createEditor();
  editor.children = nodes;
  editor.isInline = (node) => node.type === BlockType.Mention;
  editor.isVoid = editor.isInline;
  return editor;
};

test('names: Latin, Cyrillic, spaces, brackets, Unicode normalization and reserved name', () => {
  ['Бэкенд', 'QA', 'QA (ручное тестирование)', 'Team [API] (v2)', 'é', 'A & B <C> "D"'].forEach(
    (name) => assert.ok(validGroupName(name), name)
  );
  ['', ' ', '@QA', 'room', 'ROOM', 'x\ny', 'x\ty', 'a'.repeat(101)].forEach((name) =>
    assert.ok(!validGroupName(name), name)
  );
  assert.equal(normalizeGroupName('  e\u0301  '), 'é');
});

test('state parsing validates shapes, deduplicates IDs, ignores deleted/malformed groups', () => {
  assert.deepEqual(
    parseMentionGroup('!s:test', 'qa', { name: 'QA', user_ids: [bob, bob] })?.userIds,
    [bob]
  );
  [
    {},
    { name: 'QA' },
    { name: 'QA', user_ids: ['invalid'] },
    { name: '@room', user_ids: [] },
    null,
    [],
  ].forEach((value) => assert.equal(parseMentionGroup('!s:test', 'qa', value), undefined));
  assert.ok(
    parseMentionGroup('!s:test', 'qa', {
      name: 'QA',
      user_ids: [],
      color: 'url(javascript:x)',
    })?.color.startsWith('#')
  );
});

test('every combination of three overlapping groups, user and @room, including duplicates and literal @ text', async () => {
  const { mx, room, group } = fixture();
  const groups = [
    group('api', 'Бэкенд (API)', [me, bob, dave]),
    group('qa', 'QA Team', [bob, carol]),
    group('one', 'Один', [carol]),
  ];
  const parts = [
    ...groups.map(pill),
    createMentionElement(bob, '@bob', false),
    createMentionElement(room.roomId, '@room', true),
  ];
  for (let mask = 0; mask < 32; mask += 1) {
    const selected = parts.filter((_, index) => mask & (1 << index));
    const nodes = [
      paragraph([
        { text: '@ @@ @QA mail@QA.test @room (literal) ' },
        ...selected.flatMap((p) => [p, { text: ' @! ' }, p, { text: ' ' }]),
      ]),
    ];
    const resolved = await resolveGroupMentions(mx, room, nodes);
    const mentions = getMentions(mx, room.roomId, editorFor(nodes), resolved);
    const expected = new Set<string>();
    if (mask & 1) expected.add(bob);
    if (mask & 2) {
      expected.add(bob);
      expected.add(carol);
    }
    if (mask & 4) expected.add(carol);
    if (mask & 8) expected.add(bob);
    assert.deepEqual([...mentions.users].sort(), [...expected].sort(), `mask ${mask}`);
    assert.equal(mentions.room, !!(mask & 16));
    assert.ok(!mentions.users.has(me));
    assert.ok(!mentions.users.has(dave));
    const html = toMatrixCustomHTML(nodes, { groupMentions: resolved });
    const restored = htmlToEditorInput(html, false);
    const roundtrip = getMentions(mx, room.roomId, editorFor(restored));
    assert.deepEqual([...roundtrip.users].sort(), [...mentions.users].sort(), `roundtrip ${mask}`);
    assert.equal(roundtrip.room, mentions.room);
    assert.equal(toPlainText(restored, false), toPlainText(nodes, false, resolved));
  }
});

test('empty and singleton groups remain groups without inventing recipients', async () => {
  const { mx, room, group } = fixture();
  for (const ids of [[], [dave], [bob], [me]]) {
    const g = group('small', 'Группа (одна)', ids);
    const nodes = [paragraph([pill(g)])];
    const resolved = await resolveGroupMentions(mx, room, nodes);
    const mentions = getMentions(mx, room.roomId, editorFor(nodes), resolved);
    assert.deepEqual([...mentions.users], ids.includes(bob) ? [bob] : []);
    assert.equal(mentions.room, false);
    const restored = htmlToEditorInput(
      toMatrixCustomHTML(nodes, { groupMentions: resolved }),
      false
    );
    assert.ok(JSON.stringify(restored).includes('"group":'));
  }
});

test('complete lazy member lists are awaited; departed and invited members are excluded', async () => {
  const { mx, room, space, group, member } = fixture();
  member(room, bob, 'invite');
  member(space, carol, 'leave');
  room.loadMembersIfNeeded = async () => {
    await Promise.resolve();
    member(room, bob);
    return true;
  };
  const g = group('qa', 'QA', [bob, carol, dave]);
  const result = await resolveGroupMentions(mx, room, [paragraph([pill(g)])]);
  assert.deepEqual(
    result.get(groupMentionKey(g))?.members.map((m) => m.id),
    [bob]
  );
  room.loadMembersIfNeeded = async () => {
    throw new Error('network');
  };
  await assert.rejects(resolveGroupMentions(mx, room, [paragraph([pill(g)])]), /network/);
});

test('existing snapshots survive rename, deletion and changes of membership; new pills use current state', async () => {
  const { mx, room, group, state, space } = fixture();
  const original = group('qa', 'QA', [bob]);
  const first = await resolveGroupMentions(mx, room, [paragraph([pill(original)])]);
  const snapshot = first.get(groupMentionKey(original))!;
  group('qa', 'Новая QA', [carol]);
  for (const children of [
    [pill(original), pill(snapshot)],
    [pill(snapshot), pill(original)],
  ]) {
    const result = await resolveGroupMentions(mx, room, [paragraph(children)]);
    assert.deepEqual(
      getResolvedGroup(original, result).members.map((m) => m.id),
      [carol]
    );
    assert.deepEqual(
      getResolvedGroup(snapshot, result).members.map((m) => m.id),
      [bob]
    );
  }
  state(space, MENTION_GROUP_EVENT, 'qa', {});
  await assert.rejects(resolveGroupMentions(mx, room, [paragraph([pill(original)])]));
  assert.equal((await resolveGroupMentions(mx, room, [paragraph([pill(snapshot)])])).size, 0);
});

test('nested/multiple spaces and cycles: only joined ancestor spaces expose groups', () => {
  const { mx, room, space, group, state, makeRoom } = fixture();
  group('a', 'Team', [bob]);
  const outer = makeRoom('!outer:test', true);
  outer.updateMyMembership('join');
  state(outer, 'm.space.child', space.roomId, { via: ['test'] });
  state(space, 'm.space.child', outer.roomId, { via: ['test'] });
  state(outer, MENTION_GROUP_EVENT, 'a', { name: 'Team', user_ids: [] });
  assert.equal(getRoomMentionGroups(mx, room.roomId).length, 2);
  outer.updateMyMembership('leave');
  assert.equal(getRoomMentionGroups(mx, room.roomId).length, 1);
  state(space, 'm.space.child', room.roomId, {});
  assert.equal(getRoomMentionGroups(mx, room.roomId).length, 0);
});

test('metadata and fallback escape markup; malformed/spoofed wrappers never conceal text', () => {
  const g = {
    id: 'qa',
    spaceId: '!s:test',
    name: 'QA <&> "(тест)"',
    color: '#123456',
    members: [{ id: bob, name: '<script>" & Иван' }],
  };
  const html = groupMentionHtml(g);
  assert.ok(!html.includes('<script>'));
  const node = parse(sanitizeCustomHtml(html))[0] as Element;
  assert.deepEqual(readGroupMentionNode(node), g);
  assert.equal(
    readGroupMentionNode(parse(html.replace('</span>', 'HIDDEN</span>'))[0] as Element),
    undefined
  );
  assert.equal(
    readGroupMentionNode(
      parse(html.replace(encodeURIComponent(bob), encodeURIComponent(carol)))[0] as Element
    ),
    undefined
  );
  for (const value of [
    '%',
    '{}',
    'null',
    '[]',
    encodeURIComponent(JSON.stringify({ ...g, members: [{}] })),
  ])
    assert.equal(decodeGroupMention(value), undefined);
  assert.equal(groupMentionText({ ...g, members: [] }), '@QA <&> "(тест)"');
});

test('mentions in code blocks are inert and wrong room link named @room is not a broadcast', () => {
  const { mx, room } = fixture();
  const nodes = [
    { type: BlockType.CodeBlock, children: [createMentionElement(bob, '@bob', false)] },
    paragraph([createMentionElement('!other:test', '@room', true)]),
  ] as Descendant[];
  const mentions = getMentions(mx, room.roomId, editorFor(nodes));
  assert.equal(mentions.users.size, 0);
  assert.equal(mentions.room, false);
});

test('autocomplete boundaries include spaces, punctuation, Cyrillic; reject emails, URLs and @@', () => {
  for (const [input, query] of [
    ['@QA', 'QA'],
    ['(@Бэкенд (API)', 'Бэкенд (API)'],
    ['test @QA Team', 'QA Team'],
    ['@QA) @Бэк', 'Бэк'],
    ['@', ''],
  ]) {
    const editor = editorFor([paragraph([{ text: input }])]);
    Transforms.select(editor, Editor.end(editor, []));
    const range = getPrevWordRange(editor)!;
    assert.equal(getAutocompleteQuery(editor, range, AUTOCOMPLETE_PREFIXES)?.text, query, input);
  }
  ['mail@QA.test', '@@QA', 'https://x/@QA', 'foo@QA', '@QA\nrest'].forEach((input) =>
    assert.equal(mentionQueryStart(input), undefined, input)
  );
  assert.throws(() => assertMentionContentSize({ body: 'ю'.repeat(30000) }), /слишком большое/);
});

test('Markdown code and formatted inline code never produce hidden pings', async () => {
  const { mx, room, group } = fixture();
  const g = group('qa', 'QA', [bob]);
  for (const nodes of [
    [paragraph([{ text: '`' }, pill(g), { text: '`' }])],
    [paragraph([{ text: '```' }]), paragraph([pill(g)]), paragraph([{ text: '```' }])],
    [paragraph([{ text: '`' }, createMentionElement(bob, '@bob', false), { text: '`' }])],
  ]) {
    const resolved = await resolveGroupMentions(mx, room, nodes);
    const html = toMatrixCustomHTML(nodes, {
      groupMentions: resolved,
      allowBlockMarkdown: true,
      allowInlineMarkdown: true,
    });
    const mentions = getMentions(mx, room.roomId, editorFor(nodes), resolved, html);
    assert.equal(mentions.users.size, 0, html);
    assert.equal(mentions.room, false);
  }
});

test('new-message copies resolve fresh membership without mutating historical pills', async () => {
  const { mx, room, group } = fixture();
  const first = group('qa', 'QA', [bob]);
  const resolved = await resolveGroupMentions(mx, room, [paragraph([pill(first)])]);
  const historical = resolved.get(groupMentionKey(first))!;
  group('qa', 'QA новая', [carol]);
  const original = [paragraph([pill(historical)])];
  const copied = freshGroupMentionNodes(original);
  const current = await resolveGroupMentions(mx, room, copied);
  assert.deepEqual(
    getResolvedGroup(first, current).members.map((m) => m.id),
    [carol]
  );
  assert.deepEqual(
    historical.members.map((m) => m.id),
    [bob]
  );
  assert.deepEqual(
    getMentions(mx, room.roomId, editorFor(copied), current).users,
    new Set([carol])
  );
});

test('group identifiers are safe opaque random state keys', () => {
  const ids = Array.from({ length: 100 }, createMentionGroupId);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^[0-9a-f]{32}$/));
});

test('converting a selected group to an explicit code block is inert with Markdown on or off', async () => {
  const { mx, room, group } = fixture();
  const g = group('qa', 'QA', [bob]);
  const nodes = [
    { type: BlockType.CodeBlock, children: [{ type: BlockType.CodeLine, children: [pill(g)] }] },
  ] as Descendant[];
  for (const markdown of [false, true]) {
    const resolved = await resolveGroupMentions(mx, room, nodes);
    assert.equal(resolved.size, 0);
    const html = toMatrixCustomHTML(nodes, {
      groupMentions: resolved,
      allowBlockMarkdown: markdown,
      allowInlineMarkdown: markdown,
    });
    assert.ok(html.includes('<pre><code>@QA'));
    assert.ok(!html.includes('data-cinny'));
    assert.deepEqual(
      getMentions(mx, room.roomId, editorFor(nodes), resolved, html).users,
      new Set()
    );
    assert.equal(toPlainText(nodes, markdown, resolved).trim(), '@QA');
  }
});

test('unclosed, escaped and unsupported Markdown delimiters do not suppress selected mentions', async () => {
  const { mx, room, group } = fixture();
  const g = group('qa', 'QA', [bob]);
  for (const [before, after] of [
    ['`', ''],
    ['\\`', '\\`'],
    ['~~~\n', '\n~~~'],
  ]) {
    const nodes = [paragraph([{ text: before }, pill(g), { text: after }])];
    const resolved = await resolveGroupMentions(mx, room, nodes);
    const html = toMatrixCustomHTML(nodes, {
      groupMentions: resolved,
      allowBlockMarkdown: true,
      allowInlineMarkdown: true,
    });
    assert.deepEqual(
      getMentions(mx, room.roomId, editorFor(nodes), resolved, html).users,
      new Set([bob]),
      html
    );
  }
});
