import { t } from 'i18next';
import React, { useCallback, useState } from 'react';
import {
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Scroll,
  Switch,
  Button,
  MenuItem,
  config,
  color,
} from 'folds';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { copyToClipboard } from '../../../utils/dom';
import { useRoom } from '../../../hooks/useRoom';
import { useRoomState } from '../../../hooks/useRoomState';
import { StateEventEditor, StateEventInfo } from './StateEventEditor';
import { SendRoomEvent } from './SendRoomEvent';
import { useRoomAccountData } from '../../../hooks/useRoomAccountData';
import { CutoutCard } from '../../../components/cutout-card';
import {
  AccountDataEditor,
  AccountDataSubmitCallback,
} from '../../../components/AccountDataEditor';
import { useMatrixClient } from '../../../hooks/useMatrixClient';

type DeveloperToolsProps = {
  requestClose: () => void;
};
export function DeveloperTools({ requestClose }: DeveloperToolsProps) {
  const [developerTools, setDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const mx = useMatrixClient();
  const room = useRoom();

  const roomState = useRoomState(room);
  const accountData = useRoomAccountData(room);

  const [expandState, setExpandState] = useState(false);
  const [expandStateType, setExpandStateType] = useState<string>();
  const [openStateEvent, setOpenStateEvent] = useState<StateEventInfo>();
  const [composeEvent, setComposeEvent] = useState<{ type?: string; stateKey?: string }>();

  const [expandAccountData, setExpandAccountData] = useState(false);
  const [accountDataType, setAccountDataType] = useState<string | null>();

  const handleClose = useCallback(() => {
    setOpenStateEvent(undefined);
    setComposeEvent(undefined);
    setAccountDataType(undefined);
  }, []);

  const submitAccountData: AccountDataSubmitCallback = useCallback(
    async (type, content) => {
      await mx.setRoomAccountData(room.roomId, type, content);
    },
    [mx, room.roomId]
  );

  if (accountDataType !== undefined) {
    return (
      <AccountDataEditor
        type={accountDataType ?? undefined}
        content={accountDataType ? accountData.get(accountDataType) : undefined}
        submitChange={submitAccountData}
        requestClose={handleClose}
      />
    );
  }

  if (composeEvent) {
    return <SendRoomEvent {...composeEvent} requestClose={handleClose} />;
  }

  if (openStateEvent) {
    return <StateEventEditor {...openStateEvent} requestClose={handleClose} />;
  }

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              {t('Developer Tools')}
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton aria-label="Закрыть" onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">{t('Options')}</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={t('Enable Developer Tools')}
                    after={
                      <Switch
                        variant="Primary"
                        value={developerTools}
                        onChange={setDeveloperTools}
                      />
                    }
                  />
                </SequenceCard>
                {developerTools && (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title={t('Room ID')}
                      description={t('Copy room ID to clipboard. ("{{value1}}")', {
                        value1: room.roomId,
                      })}
                      after={
                        <Button
                          onClick={() => copyToClipboard(room.roomId ?? '<NO_ROOM_ID_FOUND>')}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                        >
                          <Text size="B300">{t('Copy')}</Text>
                        </Button>
                      }
                    />
                  </SequenceCard>
                )}
              </Box>

              {developerTools && (
                <Box direction="Column" gap="100">
                  <Text size="L400">{t('Data')}</Text>

                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title={t('New Message Event')}
                      description={t('Create and send a new message event within the room.')}
                      after={
                        <Button
                          onClick={() => setComposeEvent({})}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                        >
                          <Text size="B300">{t('Compose')}</Text>
                        </Button>
                      }
                    />
                  </SequenceCard>
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title={t('Room State')}
                      description={t('State events of the room.')}
                      after={
                        <Button
                          onClick={() => setExpandState(!expandState)}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                          before={
                            <Icon
                              src={expandState ? Icons.ChevronTop : Icons.ChevronBottom}
                              size="100"
                              filled
                            />
                          }
                        >
                          <Text size="B300">{expandState ? t('Collapse') : t('Expand')}</Text>
                        </Button>
                      }
                    />
                    {expandState && (
                      <Box direction="Column" gap="100">
                        <Box justifyContent="SpaceBetween">
                          <Text size="L400">{t('Events')}</Text>
                          <Text size="L400">
                            {t('Total: ')}
                            {roomState.size}
                          </Text>
                        </Box>
                        <CutoutCard>
                          <MenuItem
                            onClick={() => setComposeEvent({ stateKey: '' })}
                            variant="Surface"
                            fill="None"
                            size="300"
                            radii="0"
                            before={<Icon size="50" src={Icons.Plus} />}
                          >
                            <Box grow="Yes">
                              <Text size="T200" truncate>
                                {t('Add New')}
                              </Text>
                            </Box>
                          </MenuItem>
                          {Array.from(roomState.keys())
                            .sort()
                            .map((eventType) => {
                              const expanded = eventType === expandStateType;
                              const stateKeyToEvents = roomState.get(eventType);
                              if (!stateKeyToEvents) return null;

                              return (
                                <Box id={eventType} key={eventType} direction="Column" gap="100">
                                  <MenuItem
                                    onClick={() =>
                                      setExpandStateType(expanded ? undefined : eventType)
                                    }
                                    variant="Surface"
                                    fill="None"
                                    size="300"
                                    radii="0"
                                    before={
                                      <Icon
                                        size="50"
                                        src={expanded ? Icons.ChevronBottom : Icons.ChevronRight}
                                      />
                                    }
                                    after={<Text size="L400">{stateKeyToEvents.size}</Text>}
                                  >
                                    <Box grow="Yes">
                                      <Text size="T200" truncate>
                                        {eventType}
                                      </Text>
                                    </Box>
                                  </MenuItem>
                                  {expanded && (
                                    <div
                                      style={{
                                        marginLeft: config.space.S400,
                                        borderLeft: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
                                      }}
                                    >
                                      <MenuItem
                                        onClick={() =>
                                          setComposeEvent({ type: eventType, stateKey: '' })
                                        }
                                        variant="Surface"
                                        fill="None"
                                        size="300"
                                        radii="0"
                                        before={<Icon size="50" src={Icons.Plus} />}
                                      >
                                        <Box grow="Yes">
                                          <Text size="T200" truncate>
                                            {t('Add New')}
                                          </Text>
                                        </Box>
                                      </MenuItem>
                                      {Array.from(stateKeyToEvents.keys())
                                        .sort()
                                        .map((stateKey) => (
                                          <MenuItem
                                            onClick={() => {
                                              setOpenStateEvent({
                                                type: eventType,
                                                stateKey,
                                              });
                                            }}
                                            key={stateKey}
                                            variant="Surface"
                                            fill="None"
                                            size="300"
                                            radii="0"
                                            after={<Icon size="50" src={Icons.ChevronRight} />}
                                          >
                                            <Box grow="Yes">
                                              <Text size="T200" truncate>
                                                {stateKey ? `"${stateKey}"` : t('Default')}
                                              </Text>
                                            </Box>
                                          </MenuItem>
                                        ))}
                                    </div>
                                  )}
                                </Box>
                              );
                            })}
                        </CutoutCard>
                      </Box>
                    )}
                  </SequenceCard>
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title={t('Account Data')}
                      description={t('Private personalization data stored within room.')}
                      after={
                        <Button
                          onClick={() => setExpandAccountData(!expandAccountData)}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                          before={
                            <Icon
                              src={expandAccountData ? Icons.ChevronTop : Icons.ChevronBottom}
                              size="100"
                              filled
                            />
                          }
                        >
                          <Text size="B300">{expandAccountData ? t('Collapse') : t('Expand')}</Text>
                        </Button>
                      }
                    />
                    {expandAccountData && (
                      <Box direction="Column" gap="100">
                        <Box justifyContent="SpaceBetween">
                          <Text size="L400">{t('Events')}</Text>
                          <Text size="L400">
                            {t('Total: ')}
                            {accountData.size}
                          </Text>
                        </Box>
                        <CutoutCard>
                          <MenuItem
                            variant="Surface"
                            fill="None"
                            size="300"
                            radii="0"
                            before={<Icon size="50" src={Icons.Plus} />}
                            onClick={() => setAccountDataType(null)}
                          >
                            <Box grow="Yes">
                              <Text size="T200" truncate>
                                {t('Add New')}
                              </Text>
                            </Box>
                          </MenuItem>
                          {Array.from(accountData.keys())
                            .sort()
                            .map((type) => (
                              <MenuItem
                                key={type}
                                variant="Surface"
                                fill="None"
                                size="300"
                                radii="0"
                                after={<Icon size="50" src={Icons.ChevronRight} />}
                                onClick={() => setAccountDataType(type)}
                              >
                                <Box grow="Yes">
                                  <Text size="T200" truncate>
                                    {type}
                                  </Text>
                                </Box>
                              </MenuItem>
                            ))}
                        </CutoutCard>
                      </Box>
                    )}
                  </SequenceCard>
                </Box>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
