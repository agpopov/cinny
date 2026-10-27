import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  MEMBERS_DRAWER_WIDTH,
  NAV_WIDTH,
  THREAD_PANEL_WIDTH,
  clampPanelWidth,
  panelWidthStyle,
} from '../src/app/utils/panelWidth.ts';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('panel width stays within the allowed range', () => {
  assert.equal(clampPanelWidth(100, 1920, NAV_WIDTH), NAV_WIDTH.min);
  assert.equal(clampPanelWidth(300.4, 1920, NAV_WIDTH), 300);
  assert.equal(clampPanelWidth(2000, 1920, NAV_WIDTH), NAV_WIDTH.max);
  assert.equal(clampPanelWidth(100, 1920, THREAD_PANEL_WIDTH), THREAD_PANEL_WIDTH.min);
  assert.equal(clampPanelWidth(2000, 1920, MEMBERS_DRAWER_WIDTH), MEMBERS_DRAWER_WIDTH.max);
});

test('panel width never takes more than 40% of a narrow window', () => {
  assert.equal(clampPanelWidth(500, 1000, NAV_WIDTH), 400);
  // The minimum wins when 40% of the window is below it.
  assert.equal(clampPanelWidth(500, 400, NAV_WIDTH), NAV_WIDTH.min);
});

test('saved width overrides the CSS width with a viewport cap', () => {
  assert.equal(panelWidthStyle(undefined, NAV_WIDTH), undefined);
  assert.deepEqual(panelWidthStyle(380, THREAD_PANEL_WIDTH), {
    width: 'min(380px, 40vw)',
    minWidth: THREAD_PANEL_WIDTH.min,
    maxWidth: 'none',
  });
});

test('panel widths are stored settings without default values', () => {
  const settings = source('../src/app/state/settings.ts');
  const defaults = settings.slice(settings.indexOf('const defaultSettings'));
  for (const key of ['navWidth', 'threadPanelWidth', 'membersDrawerWidth']) {
    assert.match(settings, new RegExp(`${key}\\?: number;`));
    // No default keeps the built-in width until the user drags the edge;
    // a reset stores undefined, which JSON drops from localStorage.
    assert.doesNotMatch(defaults, new RegExp(key));
  }
});

test('chat list, thread panel and members drawer are resizable on desktop only', () => {
  const page = source('../src/app/components/page/Page.tsx');
  assert.match(page, /const resizable = !isMobile && size !== '300';/);
  assert.match(page, /edge="Right"/);

  const thread = source('../src/app/features/room/thread/ThreadPanel.tsx');
  assert.match(thread, /\{!mobile && \(\s*<PanelResizer[\s\S]*?edge="Left"/);

  const members = source('../src/app/features/room/MembersDrawer.tsx');
  assert.match(members, /<PanelResizer[\s\S]*?edge="Left"/);

  const resizer = source('../src/app/components/panel-resizer/PanelResizer.tsx');
  assert.match(resizer, /role="separator"/);
  assert.match(resizer, /onDoubleClick=\{\(\) => onChange\(undefined\)\}/);
  assert.match(resizer, /const direction = edge === 'Left' \? -1 : 1;/);
});

test('members and threads take turns on the right side', () => {
  const room = source('../src/app/features/room/Room.tsx');
  assert.match(room, /!threadPanel && screenSize === ScreenSize\.Desktop && isDrawer/);

  const header = source('../src/app/features/room/RoomViewHeader.tsx');
  assert.match(header, /const membersVisible = peopleDrawer && !threadPanel;/);
  assert.match(
    header,
    /if \(threadPanel\) \{\s*setThreadPanel\(undefined\);\s*setPeopleDrawer\(true\);/
  );
});
