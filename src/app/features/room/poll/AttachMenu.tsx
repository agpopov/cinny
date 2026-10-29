import React, { MouseEventHandler, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { IContent } from 'matrix-js-sdk';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  config,
} from 'folds';
import { useSetAtom } from 'jotai';
import { roomIdToThreadPanelAtomFamily } from '../../../state/room/threadPanel';
import { useBackDismiss } from '../../../hooks/useBackDismiss';
import { PollDialog } from './PollDialog';
import { stopPropagation } from '../../../utils/keyboard';

type AttachMenuProps = {
  roomId: string;
  threadRootId?: string;
  onPickFile: () => void;
  creatingThread?: boolean;
  onPollSubmit?: (content: IContent) => Promise<unknown>;
};
export function AttachMenu({
  roomId,
  threadRootId,
  onPickFile,
  creatingThread,
  onPollSubmit,
}: AttachMenuProps) {
  const setThreadPanel = useSetAtom(roomIdToThreadPanelAtomFamily(roomId));
  const [anchor, setAnchor] = useState<RectCords>();
  const [pollOpen, setPollOpen] = useState(false);

  const close = () => setAnchor(undefined);
  useBackDismiss(!!anchor, close, 25);
  useBackDismiss(pollOpen, () => setPollOpen(false), 40);
  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) =>
    setAnchor(evt.currentTarget.getBoundingClientRect());

  return (
    <>
      <PopOut
        anchor={anchor}
        position="Top"
        align="Start"
        offset={8}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: close,
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                <MenuItem
                  size="300"
                  radii="300"
                  before={<Icon size="100" src={Icons.File} />}
                  onClick={() => {
                    close();
                    onPickFile();
                  }}
                >
                  <Text size="T300">Файл</Text>
                </MenuItem>
                {!threadRootId && !creatingThread && (
                  <MenuItem
                    size="300"
                    radii="300"
                    before={<Icon size="100" src={Icons.Thread} />}
                    onClick={() => {
                      close();
                      setThreadPanel({ view: 'create' });
                    }}
                  >
                    <Text size="T300">Создать тред</Text>
                  </MenuItem>
                )}
                <MenuItem
                  size="300"
                  radii="300"
                  before={<Icon size="100" src={Icons.OrderList} />}
                  onClick={() => {
                    close();
                    setPollOpen(true);
                  }}
                >
                  <Text size="T300">Опрос</Text>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      >
        <IconButton
          onClick={handleOpen}
          aria-pressed={!!anchor}
          aria-label="Прикрепить"
          variant="SurfaceVariant"
          size="300"
          radii="300"
        >
          <Icon src={Icons.PlusCircle} />
        </IconButton>
      </PopOut>
      {pollOpen && (
        <PollDialog
          roomId={roomId}
          threadRootId={threadRootId}
          onClose={() => setPollOpen(false)}
          onSubmit={onPollSubmit}
          submitLabel={creatingThread ? 'Создать тред с опросом' : undefined}
        />
      )}
    </>
  );
}
