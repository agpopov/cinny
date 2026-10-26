// A source-level browser fixture: execute installed CommonJS dependencies as-is,
// strip TS types natively and use React.createElement. No compiler or bundler.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { config, DefaultReset, toRem } from 'folds';
import { sourceCallback, sourceModule } from './composer-source.mjs';
import { BlockType, MarkType } from './editor-types.mjs';

const modules = {};
function collect(file) {
  if (modules[file]) return;
  const source = readFileSync(file, 'utf8');
  const imports = {};
  modules[file] = { source, imports };
  const require = createRequire(file);
  for (const [, , name] of source.matchAll(/require\((['"])([^'"]+)\1\)/g)) {
    const resolved = require.resolve(name);
    imports[name] = resolved;
    collect(resolved);
  }
}
const require = createRequire(import.meta.url);
const entries = Object.fromEntries(
  ['react', 'react-dom', 'slate', 'slate-react', 'slate-history', 'is-hotkey'].map((name) => [
    name,
    require.resolve(name),
  ])
);
Object.values(entries).forEach(collect);

// Evaluate the actual CSS declarations as data for the browser layout probe.
// This does not run vanilla-extract or produce application CSS/build artifacts.
const rules = [];
let index = 0;
const style = (styles) => {
  const name = `probe${index++}`;
  const parts = Array.isArray(styles) ? styles : [styles];
  for (const part of parts)
    if (part && typeof part === 'object') rules.push({ selector: `.${name}`, styles: part });
  return name;
};
const globalStyle = (selector, styles) =>
  rules.push({ selector: selector.replace(/\bprobe\d+\b/g, '.$&'), styles });
const styles = new Function(
  'style',
  'globalStyle',
  'DefaultReset',
  'config',
  'toRem',
  `${sourceModule(
    '../../src/app/features/room/message/styles.css.ts'
  )}; return { MessageBase, MessageOptionsBase, MessageOptionsBar };`
)(style, globalStyle, DefaultReset, config, toRem);
const variables = {};
for (const [name, value] of Object.entries(config.space))
  variables[value.slice(4, -1)] = `${(Number(name.slice(1)) / 100) * 4}px`;

const runtime = `
window.process = { env: { NODE_ENV: 'development' } };
const modules = ${JSON.stringify(modules)};
const cache = {};
function load(file) {
  if (cache[file]) return cache[file].exports;
  const module = { exports: {} }; cache[file] = module;
  const row = modules[file];
  new Function('require', 'module', 'exports', row.source)(name => load(row.imports[name]), module, module.exports);
  return module.exports;
}
const entries = ${JSON.stringify(entries)};
const React = load(entries.react);
const ReactDOM = load(entries['react-dom']);
const { createEditor, Editor, Transforms, Element, Point, Range, Text, Node } = load(entries.slate);
const { Slate, Editable, ReactEditor, withReact } = load(entries['slate-react']);
const { withHistory } = load(entries['slate-history']);
const { isKeyHotkey } = load(entries['is-hotkey']);
const BlockType = ${JSON.stringify(BlockType)};
const MarkType = ${JSON.stringify(MarkType)};
${sourceModule('../../src/app/components/editor/utils.ts')}
${sourceModule('../../src/app/components/editor/submission.ts')}
${sourceModule('../../src/app/components/editor/keyboard.ts')}
${sourceModule('../../src/app/utils/messageAttempt.ts')}
const probe = window.probe = { requests: [], failures: [], saved: [], composing: false, holdPreparation: false };
const mx = {
  getUserId: () => '@me:test', getRoom: () => undefined, makeTxnId: () => 'probe-' + probe.requests.length,
  sendMessage: (...args) => new Promise((resolve, reject) => {
    probe.requests.push({args, resolve, reject});
  }),
};
const messageAttempt = new MessageAttempt();
const room = { currentState: { getStateEvents: () => undefined } };
const roomId = '!probe:test', threadId = null, draftReady = true, isMarkdown = true;
const flushSync = ReactDOM.flushSync;
const sendScope = {current:0}, sendingRef = {current:false};
const uploadBoardHandlers = {current:undefined};
const freshGroupMentionNodes = structuredClone;
const mentionsOutsideMarkdownCode = nodes => nodes;
const resolveGroupMentions = () => probe.holdPreparation ? new Promise(resolve => { probe.releasePreparation = () => resolve(new Map()); }) : Promise.resolve(new Map());
const toPlainText = nodes => nodes.map(Node.string).join('\\n');
const toMatrixCustomHTML = toPlainText;
const trimCustomHtml = value => value;
const customHtmlEqualsPlainText = (a,b) => a === b;
const getMentions = () => ({users:new Set(),room:false});
const getMentionContent = (users, room) => ({user_ids:users,room});
const assertMentionContentSize = () => {};
const MsgType = {Text:'m.text'}, Command = {}, commands = {}, RelationType = {Thread:'m.thread'};
const sendTypingStatus = () => {};
const saveDraft = (nodes, reply) => probe.saved.push(structuredClone({nodes, reply}));
const flushDraft = async () => {};
const filePaste = {onKeyDown:()=>{}};
const isComposing = evt => evt.nativeEvent.isComposing || probe.composing;
function App() {
  const [editor] = React.useState(() => withReact(withHistory(createEditor())));
  probe.editor = editor;
  const [replyDraft, setReplyDraft] = React.useState();
  const [failedDraft, setFailedDraft] = React.useState();
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState('');
  const [autocompleteQuery, setAutocompleteQuery] = React.useState();
  const [enterForNewline, setEnterForNewline] = React.useState(false);
  probe.setEnterForNewline = setEnterForNewline;
  probe.enterForNewline = enterForNewline;
  const send = ${sourceCallback('../../src/app/features/room/RoomInput.tsx', 'send')};
  const submit = () => send();
  const onKeyDown = ${sourceCallback('../../src/app/features/room/RoomInput.tsx', 'handleKeyDown')};
  const readOnly = !draftReady;
  const handleKeydown = ${sourceCallback(
    '../../src/app/components/editor/Editor.tsx',
    'handleKeydown'
  )};
  return React.createElement(React.Fragment, null,
    React.createElement(Slate, {editor, initialValue:[{type:'paragraph',children:[{text:''}]}], onChange:()=>saveDraft(editor.children, replyDraft)},
      React.createElement(Editable, {'data-testid':'editor', readOnly, onKeyDown:handleKeydown, style:{minHeight:50,border:'1px solid gray',whiteSpace:'pre-wrap'}})),
    React.createElement('button', {'data-testid':'send', disabled:sending, onMouseDown:event=>event.preventDefault(), onClick:submit}, 'Отправить'),
    React.createElement('button', {'data-testid':'retry', onClick:()=>send(failedDraft)}, 'Повторить'),
    React.createElement('div', {'data-testid':'error'}, sendError));
}
ReactDOM.createRoot(document.getElementById('composer')).render(React.createElement(App));
`;
writeFileSync(
  process.argv[2] ?? '/tmp/cinny-composer-fixture.json',
  JSON.stringify({ runtime, rules, styles, variables })
);
console.log(
  `Browser fixture prepared from source and ${
    Object.keys(modules).length
  } unchanged dependency modules.`
);
