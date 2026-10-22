import React, { ChangeEventHandler, useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, Icon, Icons, Input, Switch, Text, color, config, toRem } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { describeDnd, dndUntilFromMode, manualDndActive } from '../../../utils/dnd';
import {
  DesktopSettings,
  DesktopSettingsPatch,
  DndMode,
  desktopGetSettings,
  desktopSetSettings,
  isDesktopApp,
} from '../../../utils/desktop';
import { playNotificationSound } from '../../../utils/notificationSound';

/** Громкость и тест звука. */
export function NotificationVolume() {
  const [volume, setVolume] = useSetting(settingsAtom, 'notificationVolume');
  const [enabled] = useSetting(settingsAtom, 'isNotificationSounds');

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setVolume(Number(evt.currentTarget.value));
  };

  return (
    <SettingTile
      title="Громкость звука"
      description={`${volume}%`}
      after={
        <Box alignItems="Center" gap="200">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            onChange={handleChange}
            disabled={!enabled}
            aria-label="Громкость звука уведомлений"
            style={{ width: toRem(140), accentColor: color.Primary.Main }}
          />
          <Button
            size="300"
            radii="300"
            variant="Secondary"
            fill="Soft"
            disabled={!enabled}
            onClick={() => playNotificationSound(volume)}
            before={<Icon size="100" src={Icons.VolumeHigh} />}
          >
            <Text size="B300">Проверить</Text>
          </Button>
        </Box>
      }
    />
  );
}

const DND_OPTIONS: { mode: DndMode; label: string }[] = [
  { mode: '1h', label: '1 час' },
  { mode: '8h', label: '8 часов' },
  { mode: 'tomorrow', label: 'До завтра (9:00)' },
  { mode: 'forever', label: 'Пока не выключу' },
];

/** Режим «Не беспокоить» и тихие часы. */
export function DoNotDisturbSettings() {
  const [dndUntil, setDndUntil] = useSetting(settingsAtom, 'dndUntil');
  const [allowCalls, setAllowCalls] = useSetting(settingsAtom, 'dndAllowCalls');
  const [allowMentions, setAllowMentions] = useSetting(settingsAtom, 'dndAllowMentions');
  const [quietEnabled, setQuietEnabled] = useSetting(settingsAtom, 'quietHoursEnabled');
  const [quietStart, setQuietStart] = useSetting(settingsAtom, 'quietHoursStart');
  const [quietEnd, setQuietEnd] = useSetting(settingsAtom, 'quietHoursEnd');
  const [quietWeekends, setQuietWeekends] = useSetting(settingsAtom, 'quietHoursWeekends');

  // Перерисовка раз в минуту, чтобы статус «включён до …» не устаревал.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const status = describeDnd({
    dndUntil,
    quietHoursEnabled: quietEnabled,
    quietHoursStart: quietStart,
    quietHoursEnd: quietEnd,
    quietHoursWeekends: quietWeekends,
  });
  const manualActive = manualDndActive(dndUntil);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Не беспокоить</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Режим «Не беспокоить»"
          description={
            status ? (
              <Text as="span" size="T200" style={{ color: color.Warning.Main }}>
                {status}. Уведомления и звуки отключены.
              </Text>
            ) : (
              'Выключен. Временно отключите уведомления и звуки — счётчики непрочитанного продолжат работать.'
            )
          }
          after={
            manualActive ? (
              <Button
                size="300"
                radii="300"
                variant="Secondary"
                fill="Soft"
                onClick={() => setDndUntil(dndUntilFromMode('off'))}
              >
                <Text size="B300">Выключить</Text>
              </Button>
            ) : undefined
          }
        >
          <Box gap="200" wrap="Wrap" style={{ paddingTop: config.space.S100 }}>
            {DND_OPTIONS.map((option) => (
              <Chip
                key={option.mode}
                variant="Secondary"
                radii="Pill"
                outlined
                before={<Icon size="50" src={Icons.BellMute} />}
                onClick={() => setDndUntil(dndUntilFromMode(option.mode))}
              >
                <Text size="T200">{option.label}</Text>
              </Chip>
            ))}
          </Box>
        </SettingTile>
        <SettingTile
          title="Пропускать входящие звонки"
          description="Разрешить звонкам обходить «Не беспокоить» и тихие часы. Громкость и отключение звука остаются общими."
          after={
            <Switch
              value={allowCalls}
              onChange={setAllowCalls}
              aria-label="Пропускать входящие звонки"
            />
          }
        />
        <SettingTile
          title="Пропускать упоминания и личные сообщения"
          description="В режиме «Не беспокоить» всё равно уведомлять, если вас упомянули или написали в личку."
          after={<Switch value={allowMentions} onChange={setAllowMentions} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Тихие часы по расписанию"
          description="Каждый день автоматически включать «Не беспокоить» в нерабочее время."
          after={<Switch value={quietEnabled} onChange={setQuietEnabled} />}
        />
        {quietEnabled && (
          <>
            <SettingTile
              title="Время"
              description="Интервал может переходить через полночь, например 19:00 – 09:00."
              after={
                <Box alignItems="Center" gap="200">
                  <Input
                    type="time"
                    size="300"
                    radii="300"
                    variant="Secondary"
                    value={quietStart}
                    onChange={(evt) => setQuietStart(evt.currentTarget.value)}
                    aria-label="Начало тихих часов"
                    style={{ width: toRem(110) }}
                  />
                  <Text size="T300">–</Text>
                  <Input
                    type="time"
                    size="300"
                    radii="300"
                    variant="Secondary"
                    value={quietEnd}
                    onChange={(evt) => setQuietEnd(evt.currentTarget.value)}
                    aria-label="Конец тихих часов"
                    style={{ width: toRem(110) }}
                  />
                </Box>
              }
            />
            <SettingTile
              title="Весь день в выходные"
              description="Суббота и воскресенье — без уведомлений."
              after={<Switch value={quietWeekends} onChange={setQuietWeekends} />}
            />
          </>
        )}
      </SequenceCard>
    </Box>
  );
}

/** Настройки самого приложения Cinny Desktop (трей, автозапуск). */
export function DesktopAppSettings() {
  const [desktop, setDesktop] = useState<DesktopSettings>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!isDesktopApp()) return;
    desktopGetSettings()
      .then(setDesktop)
      .catch((err) => setError(String(err)));
  }, []);

  const update = useCallback((patch: DesktopSettingsPatch) => {
    desktopSetSettings(patch)
      .then((next) => {
        setDesktop(next);
        setError(undefined);
      })
      .catch((err) => setError(String(err)));
  }, []);

  if (!isDesktopApp()) return null;

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Приложение</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        {error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        )}
        <SettingTile
          title="Запускать при входе в систему"
          description="Cinny будет открываться при входе в систему."
          after={
            <Switch
              disabled={!desktop}
              value={desktop?.autostart ?? false}
              onChange={(value) => update({ autostart: value })}
            />
          }
        />
        <SettingTile
          title="При автозапуске стартовать свёрнутым в трей"
          description="Окно не будет появляться при входе в систему, только значок в трее."
          after={
            <Switch
              disabled={!desktop || !desktop.autostart}
              value={desktop?.startMinimized ?? true}
              onChange={(value) => update({ startMinimized: value })}
            />
          }
        />
        <SettingTile
          title="Сворачивать в трей при закрытии"
          description="Крестик прячет окно, а уведомления продолжают приходить. Выйти можно из меню значка в трее."
          after={
            <Switch
              disabled={!desktop}
              value={desktop?.closeToTray ?? true}
              onChange={(value) => update({ closeToTray: value })}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
