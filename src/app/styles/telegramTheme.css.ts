import {
  assignVars,
  createTheme,
  createThemeContract,
  globalStyle,
  style,
} from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';
import {
  Sidebar,
  SidebarAvatarBase,
  SidebarItemBadgeBase,
  SidebarItemBase,
  SidebarStack,
} from '../components/sidebar/Sidebar.css';
import { NavItemBase, NavItemContent } from '../components/nav/styles.css';
import { RoomName } from '../features/room-nav/styles.css';
import { Editor, EditorPlaceholderContainer } from '../components/editor/Editor.css';
import { AutocompleteMenu } from '../components/editor/autocomplete/AutocompleteMenu.css';
import { BubbleContent, BubbleLeftArrow } from '../components/message/layout/layout.css';
import { Reply, ReplyColorVar, ReplyContent } from '../components/message/Reply.css';
import { Reaction } from '../components/message/Reaction.css';
import { UserAvatarContainer } from '../components/user-profile/styles.css';

// Region hooks restyled by the Telegram themes; they have no styles of their own.
export const RoomViewRegion = style({});
export const PlainBackground = style({});
export const RoundAvatar = style({});
export const DayDivider = style({});
export const NewMessagesDivider = style({});
export const UnreadCounter = style({});
export const AppHeader = style({});
export const EventBubble = style({});
export const ChatListNav = style({});
export const RoomIntroBubble = style({});
export const FloatingChip = style({});
export const SidebarTooltip = style({});

// Colors that differ between the light and dark Telegram themes.
export const tg = createThemeContract({
  mutedIcon: null,
  wallpaper: null,
  plainBackground: null,
  room: { hover: null, active: null, line: null, text: null },
  bubble: { bg: null, hover: null, active: null, line: null, text: null, time: null },
  link: null,
  peer: { p1: null, p2: null, p3: null, p4: null, p5: null, p6: null, p7: null, p8: null },
  reaction: { bg: null, hover: null, text: null, ownBg: null, ownHover: null, ownText: null },
  dateChip: { bg: null, text: null },
  intro: null,
  selected: { bg: null, text: null },
  counter: { bg: null, text: null, mention: null, selectedBg: null, selectedText: null },
  rail: {
    bg: null,
    hover: null,
    active: null,
    line: null,
    icon: null,
    item: null,
    itemHover: null,
    itemActive: null,
    itemLine: null,
    itemText: null,
    counter: null,
  },
});

// The default Telegram gradient (#DBDDBB, #6BA587, #D5D88D, #88B884) under the logo pattern.
const lightWallpaper = [
  'var(--telegram-wallpaper-pattern) 0 0 / 600px auto repeat',
  'radial-gradient(at 80% 10%, #DBDDBB, transparent 60%)',
  'radial-gradient(at 35% 25%, #6BA587, transparent 60%)',
  'radial-gradient(at 20% 90%, #D5D88D, transparent 60%)',
  'radial-gradient(at 65% 75%, #88B884, transparent 60%)',
  '#A9C495',
].join(', ');

export const telegramLightVars = createTheme(tg, {
  mutedIcon: '#999999',
  wallpaper: lightWallpaper,
  plainBackground: '#FFFFFF',
  room: {
    hover: 'rgba(0, 0, 0, 0.05)',
    active: 'rgba(0, 0, 0, 0.08)',
    line: 'rgba(0, 0, 0, 0.12)',
    text: '#000000',
  },
  bubble: {
    bg: '#FFFFFF',
    hover: '#F4F4F5',
    active: '#EBEDF0',
    line: '#DADDE1',
    text: '#000000',
    time: '#A0ACB6',
  },
  link: '#168ACD',
  peer: {
    p1: '#C03D33',
    p2: '#4FAD2D',
    p3: '#D09306',
    p4: '#168ACD',
    p5: '#8544D6',
    p6: '#CD4073',
    p7: '#2996AD',
    p8: '#CE671B',
  },
  reaction: {
    bg: '#E4F0FA',
    hover: '#D3E7F7',
    text: '#168ACD',
    ownBg: '#419FD9',
    ownHover: '#3A94CC',
    ownText: '#FFFFFF',
  },
  dateChip: { bg: 'rgba(42, 66, 34, 0.42)', text: '#FFFFFF' },
  intro: 'rgba(255, 255, 255, 0.55)',
  selected: { bg: '#419FD9', text: '#FFFFFF' },
  counter: {
    bg: '#B1B7BD',
    text: '#FFFFFF',
    mention: '#419FD9',
    selectedBg: '#FFFFFF',
    selectedText: '#419FD9',
  },
  rail: {
    bg: '#2E3E50',
    hover: '#38495C',
    active: '#425468',
    line: '#506378',
    icon: '#8C9DAF',
    item: '#38495C',
    itemHover: '#425468',
    itemActive: '#4C5F74',
    itemLine: '#56697F',
    itemText: '#E6EBF0',
    counter: '#7E90A3',
  },
});

// Telegram Desktop "Night" colors.
export const telegramDarkVars = createTheme(tg, {
  mutedIcon: '#6C7883',
  wallpaper: 'var(--telegram-wallpaper-pattern) 0 0 / 600px auto repeat, #0E1621',
  plainBackground: '#0E1621',
  room: {
    hover: 'rgba(255, 255, 255, 0.04)',
    active: 'rgba(255, 255, 255, 0.07)',
    line: 'rgba(255, 255, 255, 0.1)',
    text: '#F5F5F5',
  },
  bubble: {
    bg: '#182533',
    hover: '#1E2C3B',
    active: '#22334A',
    line: '#2A3A4C',
    text: '#F5F5F5',
    time: '#6D7F8F',
  },
  link: '#6AB3F3',
  peer: {
    p1: '#E17076',
    p2: '#7BC862',
    p3: '#E5CA77',
    p4: '#65AADD',
    p5: '#A695E7',
    p6: '#EE7AAE',
    p7: '#6EC9CB',
    p8: '#FAA774',
  },
  reaction: {
    bg: '#233B54',
    hover: '#2A4762',
    text: '#6AB3F3',
    ownBg: '#5288C1',
    ownHover: '#5A92CC',
    ownText: '#FFFFFF',
  },
  dateChip: { bg: 'rgba(30, 44, 58, 0.9)', text: '#F5F5F5' },
  intro: 'rgba(24, 37, 51, 0.6)',
  selected: { bg: '#2B5278', text: '#FFFFFF' },
  counter: {
    bg: '#3E546A',
    text: '#FFFFFF',
    mention: '#4082BC',
    selectedBg: '#FFFFFF',
    selectedText: '#2B5278',
  },
  rail: {
    bg: '#232E3C',
    hover: '#2B3949',
    active: '#334456',
    line: '#3A4B5E',
    icon: '#6C7883',
    item: '#2B3949',
    itemHover: '#334456',
    itemActive: '#3B4D61',
    itemLine: '#44576C',
    itemText: '#E6EBF0',
    counter: '#5E7387',
  },
});

const theme = '.telegram-theme';

// Compact header titles and muted header actions.
globalStyle(`${theme} ${AppHeader}`, {
  vars: {
    [config.fontSize.H3]: toRem(15),
    [config.fontSize.H4]: toRem(15),
    [config.fontSize.H5]: toRem(15),
    [config.lineHeight.H3]: toRem(20),
    [config.lineHeight.H4]: toRem(20),
    [config.lineHeight.H5]: toRem(20),
  },
});
globalStyle(`${theme} ${AppHeader} button`, {
  color: tg.mutedIcon,
});

// Composer rounded like the bubbles, with muted icons and placeholder.
globalStyle(`${theme} ${Editor}`, {
  borderRadius: config.radii.R500,
});
globalStyle(`${theme} ${Editor} button`, {
  color: tg.mutedIcon,
});
globalStyle(`${theme} ${EditorPlaceholderContainer}`, {
  color: tg.mutedIcon,
  opacity: 1,
});
// Mention and emoji suggestions get the composer color instead of the transparent room surface.
globalStyle(`${theme} ${AutocompleteMenu}`, {
  vars: {
    [color.Surface.Container]: tg.bubble.bg,
  },
});

// Wallpaper behind the room timeline. Surfaces inside stay transparent so it shows through.
globalStyle(`${theme} ${RoomViewRegion}`, {
  background: tg.wallpaper,
  vars: {
    ...assignVars(color.Surface, {
      Container: 'transparent',
      ContainerHover: tg.room.hover,
      ContainerActive: tg.room.active,
      ContainerLine: tg.room.line,
      OnContainer: tg.room.text,
    }),
    ...assignVars(color.SurfaceVariant, {
      Container: tg.bubble.bg,
      ContainerHover: tg.bubble.hover,
      ContainerActive: tg.bubble.active,
      ContainerLine: tg.bubble.line,
      OnContainer: tg.bubble.text,
    }),
    '--tc-link': tg.link,
    // Telegram peer name colors.
    '--mx-uc-1': tg.peer.p1,
    '--mx-uc-2': tg.peer.p2,
    '--mx-uc-3': tg.peer.p3,
    '--mx-uc-4': tg.peer.p4,
    '--mx-uc-5': tg.peer.p5,
    '--mx-uc-6': tg.peer.p6,
    '--mx-uc-7': tg.peer.p7,
    '--mx-uc-8': tg.peer.p8,
  },
});
// Modern and compact layouts have no bubbles, so messages sit on a plain background.
globalStyle(`${theme} ${RoomViewRegion}${PlainBackground}`, {
  background: tg.plainBackground,
});

// Slightly smaller bubble text with wider side padding.
globalStyle(`${theme} ${BubbleContent}`, {
  padding: `${toRem(7)} ${toRem(14)}`,
  vars: {
    [config.fontSize.T400]: toRem(14),
    [config.lineHeight.T400]: toRem(18),
    // Headings of formatted messages scale down with the text.
    [config.fontSize.H2]: toRem(18),
    [config.fontSize.H3]: toRem(17),
    [config.fontSize.H4]: toRem(16),
    [config.fontSize.H5]: toRem(15),
    [config.fontSize.H6]: toRem(14),
    [config.lineHeight.H2]: toRem(24),
    [config.lineHeight.H3]: toRem(23),
    [config.lineHeight.H4]: toRem(22),
    [config.lineHeight.H5]: toRem(20),
    [config.lineHeight.H6]: toRem(20),
  },
});

// Room events in translucent full-width bubbles without the tail, like the room greeting.
globalStyle(`${theme} ${EventBubble} ${BubbleContent}`, {
  flexGrow: 1,
  maxWidth: 'none',
  borderTopLeftRadius: config.radii.R500,
  backgroundColor: tg.intro,
});
globalStyle(`${theme} ${EventBubble} ${BubbleLeftArrow}`, {
  display: 'none',
});

// Reply quote as a tinted block with a sender-colored bar: name above one line of text.
const replyColor = `var(${ReplyColorVar}, ${color.Primary.Main})`;
globalStyle(`${theme} ${Reply}`, {
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 0,
  flexGrow: 1,
  marginBottom: toRem(4),
  padding: `${toRem(3)} ${toRem(8)}`,
  borderLeft: `${toRem(3)} solid ${replyColor}`,
  borderRadius: toRem(4),
  backgroundColor: `color-mix(in srgb, ${replyColor} 12%, transparent)`,
  textAlign: 'left',
});
globalStyle(`${theme} ${Reply} > :first-child > svg`, {
  display: 'none',
});
globalStyle(`${theme} ${ReplyContent}`, {
  opacity: 1,
});

// Reactions as borderless pills; the own reaction is filled with the accent.
globalStyle(`${theme} ${Reaction}`, {
  backgroundColor: tg.reaction.bg,
  color: tg.reaction.text,
  border: 'none',
  borderRadius: config.radii.Pill,
  padding: `${toRem(3)} ${toRem(10)} ${toRem(3)} ${toRem(7)}`,
});
globalStyle(`${theme} ${Reaction}:hover, ${theme} ${Reaction}:focus-visible`, {
  backgroundColor: tg.reaction.hover,
});
globalStyle(`${theme} ${Reaction}[aria-pressed=true]`, {
  backgroundColor: tg.reaction.ownBg,
  color: tg.reaction.ownText,
});
globalStyle(`${theme} ${Reaction}[aria-pressed=true]:hover`, {
  backgroundColor: tg.reaction.ownHover,
});

// Mentions in messages without an outline.
globalStyle(`${theme} [data-mention-id], ${theme} [data-mention-group]`, {
  boxShadow: 'none',
});

// Typing notice over the bubble wallpaper in a translucent pill, like room events.
globalStyle(`${theme} ${RoomViewRegion}:not(${PlainBackground}) ${RoomViewTyping}`, {
  width: 'fit-content',
  maxWidth: `calc(100% - 2 * ${config.space.S400})`,
  margin: `${config.space.S100} ${config.space.S400} 0`,
  padding: `${config.space.S100} ${config.space.S300}`,
  borderRadius: config.radii.Pill,
  backgroundColor: tg.intro,
});

// Room greeting at the start of the timeline in a translucent bubble.
globalStyle(`${theme} ${RoomIntroBubble}`, {
  width: 'fit-content',
  maxWidth: '100%',
  padding: config.space.S500,
  borderRadius: config.radii.R500,
  backgroundColor: tg.intro,
});

// Date chip floating over the wallpaper instead of a ruled divider.
globalStyle(`${theme} ${DayDivider} > :not(span)`, {
  visibility: 'hidden',
});
globalStyle(`${theme} ${DayDivider} > span`, {
  backgroundColor: tg.dateChip.bg,
  color: tg.dateChip.text,
  borderRadius: config.radii.Pill,
  padding: `0 ${config.space.S300}`,
  minHeight: toRem(26),
});

// "New messages" keeps the date chip shape but stays green.
globalStyle(`${theme} ${DayDivider}${NewMessagesDivider} > span`, {
  backgroundColor: `color-mix(in srgb, ${color.Success.Main} 55%, transparent)`,
  color: color.Success.OnMain,
});

// "Jump to latest" styled like the date chip.
globalStyle(`${theme} ${FloatingChip}`, {
  backgroundColor: tg.dateChip.bg,
  color: tg.dateChip.text,
  boxShadow: 'none',
  border: 'none',
});
globalStyle(`${theme} ${FloatingChip}:hover, ${theme} ${FloatingChip}:focus-visible`, {
  backgroundColor: tg.dateChip.bg,
  filter: 'brightness(1.1)',
});

globalStyle(`${theme} ${RoundAvatar}, ${theme} ${RoundAvatar} > *`, {
  borderRadius: '50%',
});
// The profile card avatar sits on a backing of the card color; round it too.
globalStyle(`${theme} ${UserAvatarContainer}`, {
  borderRadius: '50%',
});

// Every chat name is equally prominent; only the selected chat is inverted.
globalStyle(`${theme} ${NavItemBase}`, {
  vars: {
    [config.opacity.P300]: '1',
    [config.opacity.P400]: '1',
  },
});
globalStyle(
  `${theme} ${NavItemContent}, ${theme} ${NavItemBase}[data-highlight=true] ${NavItemContent}, ${theme} ${RoomName}`,
  {
    fontWeight: config.fontWeight.W400,
  }
);
globalStyle(`${theme} ${NavItemBase}[data-selected=true]`, {
  backgroundColor: tg.selected.bg,
  color: tg.selected.text,
  vars: {
    [color.Background.OnContainer]: tg.selected.text,
  },
});

// Unread counters: muted for messages, accent for mentions, inverted on a selected chat.
globalStyle(`${theme} ${UnreadCounter}`, {
  backgroundColor: tg.counter.bg,
  color: tg.counter.text,
});
globalStyle(`${theme} ${UnreadCounter}[data-highlight=true]`, {
  backgroundColor: tg.counter.mention,
});
globalStyle(`${theme} ${NavItemBase}[data-selected=true] ${UnreadCounter}`, {
  backgroundColor: tg.counter.selectedBg,
  color: tg.counter.selectedText,
});
globalStyle(`${theme} ${Sidebar} ${UnreadCounter}`, {
  backgroundColor: tg.rail.counter,
  boxShadow: `0 0 0 ${toRem(2)} ${tg.rail.bg}`,
});
globalStyle(`${theme} ${Sidebar} ${UnreadCounter}[data-highlight=true]`, {
  backgroundColor: tg.counter.mention,
});

// Chat list wider than the default 256px.
globalStyle(`${theme} ${ChatListNav}`, {
  width: toRem(346),
});

// Narrow space sidebar with round icons: 10px on each side of a 36px icon.
globalStyle(`${theme} ${Sidebar}`, {
  width: toRem(56),
});
globalStyle(`${theme} ${Sidebar} ${SidebarStack}`, {
  gap: config.space.S400,
  padding: `${config.space.S400} 0`,
});
globalStyle(`${theme} ${Sidebar} ${SidebarItemBase}`, {
  minWidth: toRem(36),
});
globalStyle(`${theme} ${Sidebar} ${SidebarItemBase}::before`, {
  left: toRem(-10 - 2),
});
globalStyle(
  `${theme} ${SidebarItemBase} > ${SidebarAvatarBase}, ${theme} ${SidebarItemBase} > ${SidebarAvatarBase} > *`,
  {
    width: toRem(36),
    height: toRem(36),
    borderRadius: '50%',
  }
);
globalStyle(`${theme} ${SidebarItemBase} > ${SidebarAvatarBase} svg`, {
  width: toRem(20),
  height: toRem(20),
});
// Compact 12px tooltips everywhere; folds renders every tooltip inside role="tooltip".
globalStyle(`${theme} [role="tooltip"]`, {
  vars: {
    [config.fontSize.H5]: toRem(12),
    [config.fontSize.T400]: toRem(12),
    [config.fontSize.T300]: toRem(12),
    [config.fontSize.L400]: toRem(12),
    [config.lineHeight.H5]: toRem(16),
    [config.lineHeight.T400]: toRem(16),
    [config.lineHeight.T300]: toRem(16),
    [config.lineHeight.L400]: toRem(16),
  },
});
globalStyle(`${theme} [role="tooltip"] > *`, {
  padding: `${toRem(4)} ${toRem(8)}`,
});
// Sidebar tooltips use a heading style; keep them regular weight.
globalStyle(`${theme} ${SidebarTooltip} *`, {
  fontWeight: config.fontWeight.W400,
});

// Counters sit on the top right corner of the icon, like Telegram folders.
globalStyle(`${theme} ${Sidebar} ${SidebarItemBadgeBase}`, {
  top: toRem(-4),
  left: 'auto',
  right: toRem(-3),
});

// Space sidebar with muted icons and counters.
globalStyle(`${theme} ${Sidebar}`, {
  vars: {
    ...assignVars(color.Background, {
      Container: tg.rail.bg,
      ContainerHover: tg.rail.hover,
      ContainerActive: tg.rail.active,
      ContainerLine: tg.rail.line,
      OnContainer: tg.rail.icon,
    }),
    ...assignVars(color.Surface, {
      Container: tg.rail.item,
      ContainerHover: tg.rail.itemHover,
      ContainerActive: tg.rail.itemActive,
      ContainerLine: tg.rail.itemLine,
      OnContainer: tg.rail.itemText,
    }),
    ...assignVars(color.SurfaceVariant, {
      Container: tg.rail.item,
      ContainerHover: tg.rail.itemHover,
      ContainerActive: tg.rail.itemActive,
      ContainerLine: tg.rail.itemLine,
      OnContainer: tg.rail.itemText,
    }),
  },
});
