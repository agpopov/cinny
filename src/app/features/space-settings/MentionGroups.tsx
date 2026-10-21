/* eslint jsx-a11y/label-has-associated-control: ["error", {"controlComponents": ["Input", "Checkbox"], "depth": 3}] */
import React, { FormEvent, useMemo, useRef, useState } from 'react';
import { Box, Button, Icon, IconButton, Icons, Input, Checkbox, Scroll, Text, config } from 'folds';
import { Room } from 'matrix-js-sdk';
import { Page, PageContent, PageHeader } from '../../components/page';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { useMentionGroups } from '../../hooks/useMentionGroups';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import {
  MentionGroup,
  createMentionGroupId,
  MENTION_GROUP_EVENT,
  assertMentionContentSize,
  groupNameKey,
  normalizeGroupName,
  validGroupName,
} from '../../utils/mentionGroups';

function GroupForm({
  space,
  group,
  canEdit,
  close,
}: {
  space: Room;
  group?: MentionGroup;
  canEdit: boolean;
  close: () => void;
}) {
  const mx = useMatrixClient();
  const groups = useMentionGroups(mx, space, true);
  const members = useRoomMembers(mx, space.roomId);
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState(group?.color ?? '#5865f2');
  const [selected, setSelected] = useState(new Set(group?.userIds ?? []));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [id] = useState(() => group?.id ?? createMentionGroupId());
  const version = useRef(
    space.currentState.getStateEvents(MENTION_GROUP_EVENT, id)?.getId()
  ).current;
  const candidates = useMemo(() => {
    const entries = new Map(
      members
        .filter((m) => m.membership === 'join' || selected.has(m.userId))
        .map((m) => [m.userId, m])
    );
    const ids = [...new Set([...entries.keys(), ...selected])];
    return ids
      .map((userId) => ({
        id: userId,
        name: entries.get(userId)?.rawDisplayName || userId,
        departed: entries.get(userId)?.membership !== 'join',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, selected]);
  const visible = candidates.filter((member) =>
    `${member.name} ${member.id}`.toLowerCase().includes(search.toLowerCase())
  );

  const save = async (remove = false) => {
    if (busy || !canEdit) return;
    setError('');
    const normalized = normalizeGroupName(name);
    if (!remove && !validGroupName(normalized)) {
      setError(
        'Название: от 1 до 100 символов, без @ и переносов строки. Имя room зарезервировано.'
      );
      return;
    }
    if (
      !remove &&
      groups.some((g) => g.id !== id && groupNameKey(g.name) === groupNameKey(normalized))
    ) {
      setError('Группа с таким названием уже существует.');
      return;
    }
    setBusy(true);
    try {
      // Detect concurrent edits before writing rather than silently replacing them.
      const events = await mx.roomState(space.roomId);
      const latest = events.find(
        (event) => event.type === MENTION_GROUP_EVENT && event.state_key === id
      );
      if (latest?.event_id !== version)
        throw new Error('Группу уже изменил другой участник. Закройте форму и откройте её снова.');
      const content = remove ? {} : { name: normalized, color, user_ids: [...selected].sort() };
      assertMentionContentSize(content);
      await mx.sendStateEvent(space.roomId, MENTION_GROUP_EVENT, content, id);
      close();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не удалось сохранить группу. Повторите попытку.'
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save();
  };
  return (
    <Box
      as="form"
      onSubmit={submit}
      direction="Column"
      gap="300"
      style={{
        padding: config.space.S300,
        border: '1px solid currentColor',
        borderRadius: config.radii.R300,
      }}
    >
      <Text size="H5">{group ? `@${group.name}` : 'Новая группа'}</Text>
      <label htmlFor={`group-name-${id}`}>
        <Text size="L400">Название группы</Text>
        <Input
          id={`group-name-${id}`}
          aria-label="Название группы"
          value={name}
          onChange={(e) => setName((e.target as HTMLInputElement).value)}
          maxLength={100}
          required
          readOnly={!canEdit || busy}
        />
      </label>
      <label htmlFor={`group-color-${id}`}>
        <Text size="L400">Цвет группы</Text>
        <input
          id={`group-color-${id}`}
          aria-label="Цвет группы"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          disabled={!canEdit || busy}
        />
      </label>
      <Text size="T300">
        Участников: {selected.size}. Упоминание уведомит только тех, кто вступил в канал.
      </Text>
      <Input
        aria-label="Поиск участников группы"
        placeholder="Найти участника…"
        value={search}
        onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
      />
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {visible.map((member) => (
          <label
            key={member.id}
            htmlFor={`group-member-${id}-${member.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: config.space.S200,
              padding: config.space.S100,
              overflowWrap: 'anywhere',
            }}
          >
            <Checkbox
              id={`group-member-${id}-${member.id}`}
              checked={selected.has(member.id)}
              disabled={!canEdit || busy}
              aria-label={`${member.name} (${member.id})`}
              readOnly
              onClick={() => {
                setSelected((previous) => {
                  const next = new Set(previous);
                  if (next.has(member.id)) next.delete(member.id);
                  else next.add(member.id);
                  return next;
                });
              }}
            />
            <span>
              {member.name}{' '}
              <small>
                {member.id}
                {member.departed ? ' · не в пространстве' : ''}
              </small>
            </span>
          </label>
        ))}
        {!visible.length && <Text size="T300">Участники не найдены.</Text>}
      </div>
      {error && (
        <Text role="alert" size="T300">
          {error}
        </Text>
      )}
      <Box gap="200" style={{ flexWrap: 'wrap' }}>
        {canEdit && (
          <Button type="submit" disabled={busy} variant="Primary" size="300" radii="300">
            <Text size="B300">{busy ? 'Сохранение…' : 'Сохранить группу'}</Text>
          </Button>
        )}
        <Button
          type="button"
          onClick={close}
          disabled={busy}
          variant="Secondary"
          size="300"
          radii="300"
        >
          <Text size="B300">Закрыть</Text>
        </Button>
        {group && canEdit && (
          <Button
            type="button"
            variant="Critical"
            size="300"
            radii="300"
            disabled={busy}
            onClick={() => (confirmDelete ? save(true) : setConfirmDelete(true))}
          >
            <Text size="B300">{confirmDelete ? 'Подтвердить удаление' : 'Удалить группу'}</Text>
          </Button>
        )}
      </Box>
    </Box>
  );
}

export function MentionGroups({ requestClose }: { requestClose: () => void }) {
  const mx = useMatrixClient();
  const space = useRoom();
  const groups = useMentionGroups(mx, space, true);
  const permissions = useRoomPermissions(useRoomCreators(space), usePowerLevels(space));
  const canEdit = permissions.stateEvent(MENTION_GROUP_EVENT, mx.getSafeUserId());
  const [editing, setEditing] = useState<MentionGroup | 'new'>();
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" alignItems="Center" gap="200">
          <Text size="H3" style={{ flexGrow: 1 }}>
            Группы упоминаний
          </Text>
          <IconButton onClick={requestClose} aria-label="Закрыть группы" variant="Surface">
            <Icon src={Icons.Cross} />
          </IconButton>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="400">
              <Text size="T300">
                Группы общие для пространства. Чтобы упомянуть группу в канале, наберите @ и
                выберите её из списка.
              </Text>
              {editing ? (
                <GroupForm
                  key={editing === 'new' ? 'new' : editing.id}
                  space={space}
                  group={editing === 'new' ? undefined : editing}
                  canEdit={canEdit}
                  close={() => setEditing(undefined)}
                />
              ) : (
                <>
                  {canEdit && (
                    <Button onClick={() => setEditing('new')} variant="Primary" radii="300">
                      <Text size="B400">Создать группу</Text>
                    </Button>
                  )}
                  {groups.map((group) => (
                    <Button
                      key={group.id}
                      variant="Secondary"
                      fill="Soft"
                      radii="300"
                      onClick={() => setEditing(group)}
                    >
                      <Text
                        size="B400"
                        style={{ color: group.color, overflowWrap: 'anywhere' }}
                      >{`@${group.name} · ${group.userIds.length}`}</Text>
                    </Button>
                  ))}
                  {!groups.length && <Text size="T300">В пространстве пока нет групп.</Text>}
                </>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
