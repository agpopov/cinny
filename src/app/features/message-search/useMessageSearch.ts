import {
  type IEventWithRoomId,
  type IResultContext,
  type ISearchRequestBody,
  type ISearchResponse,
  type ISearchResult,
  SearchOrderBy,
} from 'matrix-js-sdk';
import { useCallback } from 'react';
import { getLocalSearchIndex } from '../../hooks/useLocalSearch';
import { matchesSearch, type SearchFilters } from '../../utils/localSearch';
import { useMatrixClient } from '../../hooks/useMatrixClient';

export type ResultItem = {
  rank: number;
  event: IEventWithRoomId;
  context: IResultContext;
};

export type ResultGroup = {
  roomId: string;
  items: ResultItem[];
};

export type SearchResult = {
  nextToken?: string;
  highlights: string[];
  groups: ResultGroup[];
};

const groupSearchResult = (results: ISearchResult[]): ResultGroup[] => {
  const groups: ResultGroup[] = [];

  results.forEach((item) => {
    const roomId = item.result.room_id;
    const resultItem: ResultItem = {
      rank: item.rank,
      event: item.result,
      context: item.context,
    };

    const lastAddedGroup: ResultGroup | undefined = groups[groups.length - 1];
    if (lastAddedGroup && roomId === lastAddedGroup.roomId) {
      lastAddedGroup.items.push(resultItem);
      return;
    }
    groups.push({
      roomId,
      items: [resultItem],
    });
  });

  return groups;
};

const parseSearchResult = (result: ISearchResponse): SearchResult => {
  const roomEvents = result.search_categories.room_events;

  const searchResult: SearchResult = {
    nextToken: roomEvents?.next_batch,
    highlights: roomEvents?.highlights ?? [],
    groups: groupSearchResult(roomEvents?.results ?? []),
  };

  return searchResult;
};

export type MessageSearchParams = SearchFilters & {
  source?: string;
  term?: string;
  order?: string;
  rooms?: string[];
  senders?: string[];
};
export const useMessageSearch = (params: MessageSearchParams) => {
  const mx = useMatrixClient();
  const { term, order, rooms, senders, source, after, before, kind } = params;

  const searchMessages = useCallback(
    async (nextBatch?: string) => {
      if (!term)
        return {
          highlights: [],
          groups: [],
        };
      const limit = 20;
      const joinedRooms = mx
        .getRooms()
        .filter(
          (room) => room.getMyMembership() === 'join' && (!rooms || rooms.includes(room.roomId))
        );
      if (source !== 'server') {
        const result = await getLocalSearchIndex(mx).search(
          { term, after, before, kind, senders, rooms: joinedRooms.map((room) => room.roomId) },
          Number(nextBatch) || 0,
          limit
        );
        return {
          highlights: [term],
          nextToken: result.next === undefined ? undefined : String(result.next),
          groups: groupSearchResult(
            result.events.map((event) => ({
              rank: 0,
              result: event,
              context: { events_before: [], events_after: [], profile_info: {} },
            }))
          ),
        };
      }
      const serverRooms = joinedRooms
        .filter((room) => !mx.isRoomEncrypted(room.roomId))
        .map((room) => room.roomId);
      if (!serverRooms.length) return { highlights: [], groups: [] };

      const requestBody: ISearchRequestBody = {
        search_categories: {
          room_events: {
            event_context: {
              before_limit: 0,
              after_limit: 0,
              include_profile: false,
            },
            filter: {
              limit,
              rooms: serverRooms,
              senders,
            },
            include_state: false,
            order_by: order as SearchOrderBy.Recent,
            search_term: term,
          },
        },
      };

      const r = await mx.search({
        body: requestBody,
        next_batch: nextBatch === '' ? undefined : nextBatch,
      });
      const result = parseSearchResult(r);
      result.groups = result.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => matchesSearch(item.event, { after, before, kind })),
        }))
        .filter((group) => group.items.length > 0);
      return result;
    },
    [mx, term, order, rooms, senders, source, after, before, kind]
  );

  return searchMessages;
};
