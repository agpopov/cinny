import { t } from 'i18next';
import React, { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Text, Box, Icon, Icons, config, Spinner, Button, IconButton, Line, toRem } from 'folds';
import { useAtomValue } from 'jotai';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { SearchOrderBy } from 'matrix-js-sdk';
import { PageHero, PageHeroEmpty, PageHeroSection } from '../../components/page';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { _SearchPathSearchParams } from '../../pages/paths';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { SequenceCard } from '../../components/sequence-card';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { ScrollTopContainer } from '../../components/scroll-top-container';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { decodeSearchParamValueArray, encodeSearchParamValueArray } from '../../pages/pathUtils';
import { useRooms } from '../../state/hooks/roomList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { mDirectAtom } from '../../state/mDirectList';
import { MessageSearchParams, useMessageSearch } from './useMessageSearch';
import { SearchResultGroup } from './SearchResultGroup';
import { SearchInput } from './SearchInput';
import { SearchFilters } from './SearchFilters';
import { loadSearchHistory, useLocalSearchStatus } from '../../hooks/useLocalSearch';
import { SearchField } from './SearchFilters.css';
import { VirtualTile } from '../../components/virtualizer';

const useSearchPathSearchParams = (searchParams: URLSearchParams): _SearchPathSearchParams =>
  useMemo(
    () => ({
      global: searchParams.get('global') ?? undefined,
      term: searchParams.get('term') ?? undefined,
      order: searchParams.get('order') ?? undefined,
      rooms: searchParams.get('rooms') ?? undefined,
      senders: searchParams.get('senders') ?? undefined,
    }),
    [searchParams]
  );

type MessageSearchProps = {
  defaultRoomsFilterName: string;
  allowGlobal?: boolean;
  rooms: string[];
  senders?: string[];
  scrollRef: RefObject<HTMLDivElement>;
};
export function MessageSearch({
  defaultRoomsFilterName,
  allowGlobal,
  rooms,
  senders,
  scrollRef,
}: MessageSearchProps) {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const allRooms = useRooms(mx, allRoomsAtom, mDirects);
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');

  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollTopAnchorRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const searchPathSearchParams = useSearchPathSearchParams(searchParams);
  const source = searchParams.get('source') === 'server' ? 'server' : 'local';
  const [localTerm, setLocalTerm] = useState(searchParams.get('term') ?? '');
  useEffect(() => {
    if (source === 'local' && searchParams.has('term')) {
      setLocalTerm(searchParams.get('term') ?? '');
      const next = new URLSearchParams(searchParams);
      next.delete('term');
      setSearchParams(next, { replace: true });
    }
  }, [source, searchParams, setSearchParams]);
  const { navigateRoom } = useRoomNavigate();

  const searchParamRooms = useMemo(() => {
    if (searchPathSearchParams.rooms) {
      const joinedRoomIds = decodeSearchParamValueArray(searchPathSearchParams.rooms).filter(
        (rId) => allRooms.includes(rId)
      );
      return joinedRoomIds;
    }
    return undefined;
  }, [allRooms, searchPathSearchParams.rooms]);
  const searchParamsSenders = useMemo(() => {
    if (searchPathSearchParams.senders) {
      return decodeSearchParamValueArray(searchPathSearchParams.senders);
    }
    return undefined;
  }, [searchPathSearchParams.senders]);

  const msgSearchParams: MessageSearchParams = useMemo(() => {
    const isGlobal = searchPathSearchParams.global === 'true';
    const defaultRooms = isGlobal ? undefined : rooms;

    return {
      term: source === 'local' ? localTerm : searchPathSearchParams.term,
      order: searchPathSearchParams.order ?? SearchOrderBy.Recent,
      rooms: searchParamRooms ?? defaultRooms,
      senders: searchParamsSenders ?? senders,
    };
  }, [
    searchPathSearchParams,
    searchParamRooms,
    searchParamsSenders,
    rooms,
    senders,
    source,
    localTerm,
  ]);

  const after = searchParams.get('after') ?? '';
  const before = searchParams.get('before') ?? '';
  const kind = searchParams.get('kind') ?? 'all';
  const { version, count, error: indexError } = useLocalSearchStatus();
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyStatus, setHistoryStatus] = useState('');
  const historyAbort = useRef<AbortController>();
  useEffect(() => () => historyAbort.current?.abort(), []);
  const updateFilter = (key: string, value: string) =>
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (key === 'source' && value === 'server' && localTerm) next.set('term', localTerm);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  const loadHistory = async () => {
    if (historyAbort.current) return;
    const controller = new AbortController();
    historyAbort.current = controller;
    setHistoryBusy(true);
    setHistoryStatus('Загрузка истории…');
    try {
      const result = await loadSearchHistory(
        mx,
        msgSearchParams.rooms ?? allRooms,
        controller.signal
      );
      setHistoryStatus(
        controller.signal.aborted
          ? 'Загрузка остановлена. Уже загруженная история сохранена.'
          : `История загружена. Комнат с более ранними сообщениями: ${result.remaining}. Не расшифровано: ${result.unavailable}.`
      );
    } catch (cause) {
      setHistoryStatus(
        controller.signal.aborted
          ? 'Загрузка остановлена. Уже загруженная история сохранена.'
          : `Не удалось загрузить историю: ${
              cause instanceof Error ? cause.message : String(cause)
            }. Можно повторить загрузку.`
      );
    } finally {
      historyAbort.current = undefined;
      setHistoryBusy(false);
    }
  };
  const searchMessages = useMessageSearch({ ...msgSearchParams, source, after, before, kind });

  const { status, data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    enabled: !!msgSearchParams.term,
    queryKey: [
      'search',
      source,
      after,
      before,
      kind,
      source === 'local' ? version : 0,
      msgSearchParams.term,
      msgSearchParams.order,
      msgSearchParams.rooms,
      msgSearchParams.senders,
    ],
    queryFn: ({ pageParam }) => searchMessages(pageParam),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });

  const groups = useMemo(() => data?.pages.flatMap((result) => result.groups) ?? [], [data]);
  const highlights = useMemo(() => {
    const mixed = data?.pages.flatMap((result) => result.highlights);
    return Array.from(new Set(mixed));
  }, [data]);

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 1,
  });
  const vItems = virtualizer.getVirtualItems();

  const handleSearch = (term: string) => {
    if (source === 'local') {
      setLocalTerm(term);
      return;
    }
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('term');
      newParams.append('term', term);
      return newParams;
    });
  };
  const handleSearchClear = () => {
    setLocalTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('term');
      return newParams;
    });
  };

  const handleSelectedRoomsChange = (selectedRooms?: string[]) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('rooms');
      if (selectedRooms && selectedRooms.length > 0) {
        newParams.append('rooms', encodeSearchParamValueArray(selectedRooms));
      }
      return newParams;
    });
  };
  const handleGlobalChange = (global?: boolean) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('global');
      if (global) {
        newParams.append('global', 'true');
      }
      return newParams;
    });
  };

  const handleOrderChange = (order?: string) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      newParams.delete('order');
      if (order) {
        newParams.append('order', order);
      }
      return newParams;
    });
  };

  const lastVItem = vItems[vItems.length - 1];
  const lastVItemIndex: number | undefined = lastVItem?.index;
  const lastGroupIndex = groups.length - 1;
  useEffect(() => {
    if (
      lastGroupIndex > -1 &&
      lastGroupIndex === lastVItemIndex &&
      !isFetchingNextPage &&
      hasNextPage
    ) {
      fetchNextPage();
    }
  }, [lastVItemIndex, lastGroupIndex, fetchNextPage, isFetchingNextPage, hasNextPage]);

  return (
    <Box direction="Column" gap="700">
      <ScrollTopContainer scrollRef={scrollRef} anchorRef={scrollTopAnchorRef}>
        <IconButton
          onClick={() => virtualizer.scrollToOffset(0)}
          variant="SurfaceVariant"
          radii="Pill"
          outlined
          size="300"
          aria-label={t('Scroll to Top')}
        >
          <Icon src={Icons.ChevronTop} size="300" />
        </IconButton>
      </ScrollTopContainer>
      <Box ref={scrollTopAnchorRef} direction="Column" gap="300">
        <SearchInput
          active={!!msgSearchParams.term}
          loading={!!msgSearchParams.term && status === 'pending'}
          searchInputRef={searchInputRef}
          defaultValue={msgSearchParams.term}
          onSearch={handleSearch}
          onReset={handleSearchClear}
        />
        <Box wrap="Wrap" gap="200" alignItems="End">
          <label htmlFor="search-source">
            Где искать
            <br />
            <select
              className={SearchField}
              id="search-source"
              aria-label="Где искать"
              value={source}
              onChange={(event) => updateFilter('source', event.target.value)}
            >
              <option value="local">На этом устройстве, включая E2EE</option>
              <option value="server">На сервере, без E2EE</option>
            </select>
          </label>
          <label htmlFor="search-after">
            С даты
            <input
              className={SearchField}
              id="search-after"
              type="date"
              value={after}
              onChange={(event) => updateFilter('after', event.target.value)}
            />
          </label>
          <label htmlFor="search-before">
            По дату
            <input
              className={SearchField}
              id="search-before"
              type="date"
              value={before}
              min={after || undefined}
              onChange={(event) => updateFilter('before', event.target.value)}
            />
          </label>
          <label htmlFor="search-kind">
            Содержимое
            <br />
            <select
              className={SearchField}
              id="search-kind"
              aria-label="Тип содержимого"
              value={kind}
              onChange={(event) => updateFilter('kind', event.target.value)}
            >
              <option value="all">Все сообщения</option>
              <option value="m.text">Текст</option>
              <option value="attachment">Вложения</option>
              <option value="m.image">Изображения</option>
              <option value="m.video">Видео</option>
              <option value="m.audio">Аудио</option>
              <option value="m.file">Файлы</option>
            </select>
          </label>
          <label htmlFor="search-sender">
            Автор (Matrix ID)
            <input
              className={SearchField}
              id="search-sender"
              placeholder="@user:company.ru"
              value={searchParamsSenders?.join(', ') ?? ''}
              onChange={(event) =>
                updateFilter(
                  'senders',
                  event.target.value.trim()
                    ? encodeSearchParamValueArray(
                        event.target.value
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean)
                      )
                    : ''
                )
              }
            />
          </label>
        </Box>
        {source === 'local' && (
          <Box direction="Column" gap="200">
            <Text size="T200">
              Поиск по загруженной и расшифрованной истории этого устройства, до 50 000 событий.
              Индекс хранится локально в зашифрованном виде и удаляется при выходе. Файлы целиком не
              индексируются.
            </Text>
            <Text size="T200">Событий в индексе: {count}. Сортировка: сначала новые.</Text>
            {indexError && <Text role="alert">{indexError}</Text>}
            <Button
              onClick={historyBusy ? () => historyAbort.current?.abort() : loadHistory}
              size="300"
              variant="Secondary"
            >
              <Text>
                {historyBusy
                  ? 'Остановить загрузку'
                  : 'Загрузить более раннюю историю выбранных комнат'}
              </Text>
            </Button>
            {historyStatus && <Text role="status">{historyStatus}</Text>}
          </Box>
        )}
        <SearchFilters
          defaultRoomsFilterName={defaultRoomsFilterName}
          allowGlobal={allowGlobal}
          roomList={searchPathSearchParams.global === 'true' ? allRooms : rooms}
          selectedRooms={searchParamRooms}
          onSelectedRoomsChange={handleSelectedRoomsChange}
          global={searchPathSearchParams.global === 'true'}
          onGlobalChange={handleGlobalChange}
          order={msgSearchParams.order}
          onOrderChange={handleOrderChange}
          allowOrder={source === 'server'}
        />
      </Box>

      {!msgSearchParams.term && status === 'pending' && (
        <PageHeroEmpty>
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Message} />}
              title={t('Search Messages')}
              subTitle="Find helpful messages in your community by searching with related keywords."
            />
          </PageHeroSection>
        </PageHeroEmpty>
      )}

      {msgSearchParams.term && groups.length === 0 && status === 'success' && (
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: config.space.S300, borderRadius: config.radii.R400 }}
          alignItems="Center"
          gap="200"
        >
          <Icon size="200" src={Icons.Info} />
          <Text>
            No results found for <b>{`"${msgSearchParams.term}"`}</b>
          </Text>
        </Box>
      )}

      {((msgSearchParams.term && status === 'pending') ||
        (groups.length > 0 && vItems.length === 0)) && (
        <Box direction="Column" gap="100">
          {[...Array(8).keys()].map((key) => (
            <SequenceCard variant="SurfaceVariant" key={key} style={{ minHeight: toRem(80) }} />
          ))}
        </Box>
      )}

      {vItems.length > 0 && (
        <Box direction="Column" gap="300">
          <Box direction="Column" gap="200">
            <Text size="H5">{`Results for "${msgSearchParams.term}"`}</Text>
            <Line size="300" variant="Surface" />
          </Box>
          <div
            style={{
              position: 'relative',
              height: virtualizer.getTotalSize(),
            }}
          >
            {vItems.map((vItem) => {
              const group = groups[vItem.index];
              if (!group) return null;
              const groupRoom = mx.getRoom(group.roomId);
              if (!groupRoom) return null;

              return (
                <VirtualTile
                  virtualItem={vItem}
                  style={{ paddingBottom: config.space.S500 }}
                  ref={virtualizer.measureElement}
                  key={vItem.index}
                >
                  <SearchResultGroup
                    room={groupRoom}
                    highlights={highlights}
                    items={group.items}
                    mediaAutoLoad={mediaAutoLoad}
                    urlPreview={urlPreview}
                    onOpen={navigateRoom}
                    legacyUsernameColor={legacyUsernameColor || mDirects.has(groupRoom.roomId)}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                  />
                </VirtualTile>
              );
            })}
          </div>
          {isFetchingNextPage && (
            <Box justifyContent="Center" alignItems="Center">
              <Spinner size="600" variant="Secondary" />
            </Box>
          )}
        </Box>
      )}

      {hasNextPage && (
        <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} variant="Secondary">
          <Text>Загрузить следующие результаты</Text>
        </Button>
      )}
      {error && (
        <Box
          className={ContainerColor({ variant: 'Critical' })}
          style={{
            padding: config.space.S300,
            borderRadius: config.radii.R400,
          }}
          direction="Column"
          gap="200"
        >
          <Text size="L400">{error.name}</Text>
          <Text size="T300">{error.message}</Text>
        </Box>
      )}
    </Box>
  );
}
