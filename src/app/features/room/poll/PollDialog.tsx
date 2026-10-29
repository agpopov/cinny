import React, { FormEventHandler, useMemo, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { IContent } from 'matrix-js-sdk';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Switch,
  Text,
  color,
  config,
} from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { stopPropagation } from '../../../utils/keyboard';
import {
  POLL_MAX_ANSWERS,
  POLL_MIN_ANSWERS,
  POLL_START_TYPE,
  buildPollStartContent,
} from '../../../utils/poll';

const emptyAnswers = () => ['', ''];

type PollDialogProps = {
  roomId: string;
  threadRootId?: string;
  onClose: () => void;
  onSubmit?: (content: IContent) => Promise<unknown>;
  submitLabel?: string;
};
export function PollDialog({
  roomId,
  threadRootId,
  onClose,
  onSubmit,
  submitLabel = 'Отправить опрос',
}: PollDialogProps) {
  const mx = useMatrixClient();
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(emptyAnswers);
  const [multiple, setMultiple] = useState(false);
  const [hidden, setHidden] = useState(false);

  const filled = answers.map((a) => a.trim()).filter(Boolean);
  const unique = new Set(filled.map((a) => a.toLowerCase())).size === filled.length;
  const valid = question.trim().length > 0 && filled.length >= POLL_MIN_ANSWERS && unique;

  // Keep answer IDs stable when a failed HTTP request is retried.
  const content = useMemo(() => {
    const values = answers.map((answer) => answer.trim()).filter(Boolean);
    return buildPollStartContent({
      question: question.trim(),
      answers: values,
      disclosed: !hidden,
      maxSelections: multiple ? values.length : 1,
    });
  }, [question, answers, hidden, multiple]);
  const [sendState, send] = useAsyncCallback(async () => {
    if (onSubmit) await onSubmit(content);
    else
      await mx.sendEvent(roomId, threadRootId ?? null, POLL_START_TYPE as never, content as never);
    onClose();
  });
  const sending = sendState.status === AsyncStatus.Loading;

  const setAnswer = (index: number, value: string) =>
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!valid || sending) return;
    // The hook displays the failure; keep the dialog available for retry.
    send().catch(() => undefined);
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onClose,
            clickOutsideDeactivates: false,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" style={{ maxHeight: '90vh', width: '100vw', maxWidth: 480 }}>
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Создать опрос</Text>
              </Box>
              <IconButton size="300" onClick={onClose} radii="300" aria-label="Закрыть">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Scroll size="300" hideTrack visibility="Hover">
              <Box
                as="form"
                onSubmit={handleSubmit}
                style={{ padding: config.space.S400 }}
                direction="Column"
                gap="400"
              >
                <Box direction="Column" gap="100">
                  <Text size="L400">Вопрос</Text>
                  <Input
                    autoFocus
                    value={question}
                    onChange={(evt) => setQuestion(evt.currentTarget.value)}
                    placeholder="О чём спросить?"
                    maxLength={300}
                    variant="Background"
                    size="400"
                    radii="300"
                  />
                </Box>
                <Box direction="Column" gap="200">
                  <Text size="L400">Варианты ответа</Text>
                  {answers.map((answer, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <Box key={index} gap="200" alignItems="Center">
                      <Input
                        style={{ flexGrow: 1 }}
                        value={answer}
                        onChange={(evt) => setAnswer(index, evt.currentTarget.value)}
                        placeholder={`Вариант ${index + 1}`}
                        maxLength={200}
                        variant="Background"
                        size="300"
                        radii="300"
                      />
                      <IconButton
                        type="button"
                        size="300"
                        radii="300"
                        variant="Background"
                        aria-label="Удалить вариант"
                        disabled={answers.length <= POLL_MIN_ANSWERS}
                        onClick={() => setAnswers((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Icon size="100" src={Icons.Cross} />
                      </IconButton>
                    </Box>
                  ))}
                  <Box>
                    <Button
                      type="button"
                      size="300"
                      radii="300"
                      variant="Secondary"
                      fill="Soft"
                      disabled={answers.length >= POLL_MAX_ANSWERS}
                      before={<Icon size="100" src={Icons.Plus} />}
                      onClick={() => setAnswers((prev) => [...prev, ''])}
                    >
                      <Text size="B300">Добавить вариант</Text>
                    </Button>
                  </Box>
                  {!unique && (
                    <Text size="T200" style={{ color: color.Critical.Main }}>
                      Варианты не должны повторяться.
                    </Text>
                  )}
                </Box>
                <Box direction="Column" gap="200">
                  <Box
                    as="label"
                    alignItems="Center"
                    gap="300"
                    justifyContent="SpaceBetween"
                    style={{ cursor: 'pointer' }}
                  >
                    <Text size="T300">Можно выбрать несколько ответов</Text>
                    <Switch value={multiple} onChange={setMultiple} />
                  </Box>
                  <Box
                    as="label"
                    alignItems="Center"
                    gap="300"
                    justifyContent="SpaceBetween"
                    style={{ cursor: 'pointer' }}
                  >
                    <Text size="T300">Скрыть результаты до завершения</Text>
                    <Switch value={hidden} onChange={setHidden} />
                  </Box>
                </Box>
                {sendState.status === AsyncStatus.Error && (
                  <Text size="T300" style={{ color: color.Critical.Main }}>
                    Не удалось отправить опрос:{' '}
                    {sendState.error instanceof Error
                      ? sendState.error.message
                      : String(sendState.error)}
                  </Text>
                )}
                <Button
                  type="submit"
                  variant="Primary"
                  disabled={!valid}
                  aria-disabled={!valid || sending}
                  before={
                    sending ? <Spinner fill="Solid" variant="Primary" size="200" /> : undefined
                  }
                >
                  <Text size="B400">{sending ? 'Отправка…' : submitLabel}</Text>
                </Button>
              </Box>
            </Scroll>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
