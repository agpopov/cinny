import type { PackContent, EmoteRoomsContent } from '../../app/plugins/custom-emoji/types';
import type { InCinnySpacesContent } from '../../app/hooks/useSidebarItems';
import type { IRecentEmojiContent } from '../../app/plugins/recent-emoji';
import 'matrix-js-sdk/lib/@types/event';

declare module 'matrix-js-sdk/lib/@types/event' {
  interface StateEvents {
    'im.ponies.room_emotes': PackContent;
    'in.cinny.mention_group': { name?: string; color?: string; user_ids?: string[] };
  }
  // Matrix permits application-defined account data; Developer Tools edits it.
  interface RoomAccountDataEvents {
    [eventType: string]: object;
  }
  interface AccountDataEvents {
    [eventType: string]: object;
    'im.ponies.user_emotes': PackContent;
    'im.ponies.emote_rooms': EmoteRoomsContent;
    'in.cinny.spaces': InCinnySpacesContent;
    'io.element.recent_emoji': IRecentEmojiContent;
  }
}
