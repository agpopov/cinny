import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Icon, Icons, Spinner, Text, color } from 'folds';
import { MatrixEvent, Room } from 'matrix-js-sdk';
import classNames from 'classnames';
import * as css from './Poll.css';
import { usePoll } from './usePoll';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  POLL_END_TYPE,
  POLL_RESPONSE_TYPE,
  buildPollEndContent,
  buildPollResponseContent,
  tallyPoll,
  toggleChoice,
} from '../../../utils/poll';

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const sameSet = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && a.every((id) => b.includes(id));

type PollContentProps = {
  room: Room;
  mEvent: MatrixEvent;
};
export function PollContent({ room, mEvent }: PollContentProps) {
  const mx = useMatrixClient();
  const myUserId = mx.getSafeUserId();
  const pollId = mEvent.getId() ?? '';
  const { start, votes, ended, loading } = usePoll(room, mEvent);
  const [pending, setPending] = useState<string[]>();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string>();

  const tally = useMemo(() => (start ? tallyPoll(start, votes) : undefined), [start, votes]);
  const serverChoice = tally?.choices.get(myUserId);

  useEffect(() => {
    if (pending && sameSet(serverChoice, pending)) setPending(undefined);
  }, [pending, serverChoice]);

  if (!start || !tally) {
    return (
      <Text size="T300" priority="300">
        Не удалось показать опрос: некорректное событие.
      </Text>
    );
  }

  const myChoice = pending ?? serverChoice ?? [];
  const showResults = start.disclosed || ended;
  const canEnd =
    !ended &&
    (mEvent.getSender() === myUserId ||
      room.currentState.maySendRedactionForEvent(mEvent, myUserId));
  const maxCount = Math.max(0, ...Object.values(tally.counts));
  const multi = start.maxSelections > 1;

  const vote = async (answerId: string) => {
    if (ended) return;
    const next = toggleChoice(myChoice, answerId, start.maxSelections);
    if (sameSet(next, myChoice)) return;
    setError(undefined);
    setPending(next);
    try {
      await mx.sendEvent(
        room.roomId,
        POLL_RESPONSE_TYPE as never,
        buildPollResponseContent(pollId, next) as never
      );
    } catch {
      setPending(undefined);
      setError('Не удалось отправить голос');
    }
  };

  const endPoll = async () => {
    setError(undefined);
    try {
      await mx.sendEvent(room.roomId, POLL_END_TYPE as never, buildPollEndContent(pollId) as never);
      setConfirmEnd(false);
    } catch {
      setError('Не удалось завершить опрос');
    }
  };

  let hint = multi ? `Выберите до ${start.maxSelections}` : 'Выберите один вариант';
  if (ended) hint = 'Опрос завершён';
  else if (!start.disclosed) hint += ' · результаты будут видны после завершения';

  return (
    <Box className={css.Poll} direction="Column" gap="200">
      <Box alignItems="Center" gap="200">
        <Icon size="100" src={Icons.OrderList} />
        <Text size="T200" priority="300">
          Опрос
        </Text>
      </Box>
      <Text size="H5" style={{ overflowWrap: 'anywhere' }}>
        {start.question}
      </Text>
      <Text size="T200" priority="300">
        {hint}
      </Text>
      <Box direction="Column" gap="100" role={multi ? 'group' : 'radiogroup'}>
        {start.answers.map((answer) => {
          const checked = myChoice.includes(answer.id);
          const count = tally.counts[answer.id] ?? 0;
          const percent = tally.voters > 0 ? Math.round((count / tally.voters) * 100) : 0;
          const winner = ended && count > 0 && count === maxCount;
          return (
            <button
              key={answer.id}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={checked}
              className={css.Answer}
              disabled={ended}
              onClick={() => vote(answer.id)}
            >
              {showResults && (
                <span
                  className={classNames(css.AnswerBar, { [css.AnswerBarWinner]: winner })}
                  style={{ width: `${percent}%` }}
                />
              )}
              <Box className={css.AnswerRow} alignItems="Center" gap="200">
                <span
                  className={classNames(css.Marker, multi ? css.MarkerCheck : css.MarkerRadio)}
                  data-checked={checked}
                >
                  {checked && <Icon size="50" src={Icons.Check} />}
                </span>
                <Text as="span" size="T300" className={css.AnswerText} style={{ flexGrow: 1 }}>
                  {answer.text}
                </Text>
                {showResults && (
                  <Text as="span" size="T200" priority="300" style={{ flexShrink: 0 }}>
                    {count} · {percent}%
                  </Text>
                )}
              </Box>
            </button>
          );
        })}
      </Box>
      <Box alignItems="Center" gap="200" wrap="Wrap">
        <Text size="T200" priority="300" style={{ flexGrow: 1 }}>
          {tally.voters} {pluralRu(tally.voters, 'голос', 'голоса', 'голосов')}
          {!start.disclosed && !ended && ' скрыты'}
        </Text>
        {loading && <Spinner size="100" variant="Secondary" />}
        {canEnd &&
          (confirmEnd ? (
            <>
              <Button size="300" variant="Critical" fill="Soft" radii="300" onClick={endPoll}>
                <Text size="B300">Завершить</Text>
              </Button>
              <Button
                size="300"
                variant="Secondary"
                fill="None"
                radii="300"
                onClick={() => setConfirmEnd(false)}
              >
                <Text size="B300">Отмена</Text>
              </Button>
            </>
          ) : (
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              onClick={() => setConfirmEnd(true)}
            >
              <Text size="B300">Завершить опрос</Text>
            </Button>
          ))}
      </Box>
      {error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          {error}
        </Text>
      )}
    </Box>
  );
}
