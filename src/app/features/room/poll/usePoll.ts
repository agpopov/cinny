import { useEffect, useMemo, useState } from 'react';
import { MatrixEvent, Poll, PollEvent, Relations, Room } from 'matrix-js-sdk';
import { PollStart, PollVote, parsePollStart, parsePollVote } from '../../../utils/poll';

export type PollState = {
  start?: PollStart;
  votes: PollVote[];
  ended: boolean;
  loading: boolean;
};

const toVotes = (events: MatrixEvent[]): PollVote[] =>
  events.flatMap((e) => {
    const vote = parsePollVote(e.getSender() ?? '', e.getTs(), e.getContent());
    return vote ? [vote] : [];
  });

/** Голоса и закрытие копирует модель Poll из SDK (поздние голоса она отсеивает сама). */
export const usePoll = (room: Room, pollEvent: MatrixEvent): PollState => {
  const pollId = pollEvent.getId();
  const [poll, setPoll] = useState<Poll | undefined>(() => room.polls.get(pollId ?? ''));
  const [responses, setResponses] = useState<Relations>();
  const [, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pollId) return undefined;
    const found = room.polls.get(pollId);
    if (found) setPoll(found);
    else room.processPollEvents([pollEvent]);

    const handleNew = (created: Poll) => {
      if (created.pollId === pollId) setPoll(created);
    };
    room.on(PollEvent.New, handleNew);
    return () => {
      room.removeListener(PollEvent.New, handleNew);
    };
  }, [room, pollEvent, pollId]);

  useEffect(() => {
    if (!poll) return undefined;
    let alive = true;
    const handleResponses = (relations: Relations) => {
      setResponses(relations);
      setVersion((v) => v + 1);
    };
    const handleEnd = () => setVersion((v) => v + 1);
    poll.on(PollEvent.Responses, handleResponses);
    poll.on(PollEvent.End, handleEnd);
    poll
      .getResponses()
      .then(handleResponses)
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      poll.removeListener(PollEvent.Responses, handleResponses);
      poll.removeListener(PollEvent.End, handleEnd);
    };
  }, [poll]);

  const start = useMemo(() => parsePollStart(pollEvent.getContent()), [pollEvent]);

  return {
    start,
    votes: toVotes(responses?.getRelations() ?? []),
    ended: !!poll?.isEnded,
    loading,
  };
};
