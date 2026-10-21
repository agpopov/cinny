import { IContent } from 'matrix-js-sdk';

// Element шлёт и читает нестабильные типы MSC3381, стабильные принимаем на чтение.
export const POLL_START_TYPE = 'org.matrix.msc3381.poll.start';
export const POLL_START_TYPE_STABLE = 'm.poll.start';
export const POLL_RESPONSE_TYPE = 'org.matrix.msc3381.poll.response';
export const POLL_END_TYPE = 'org.matrix.msc3381.poll.end';

const POLL_KIND_DISCLOSED = 'org.matrix.msc3381.poll.disclosed';
const POLL_KIND_UNDISCLOSED = 'org.matrix.msc3381.poll.undisclosed';

const TEXT_KEYS = ['org.matrix.msc1767.text', 'm.text'] as const;

export const POLL_MAX_ANSWERS = 20;
export const POLL_MIN_ANSWERS = 2;

export const isPollStartType = (type: string) =>
  type === POLL_START_TYPE || type === POLL_START_TYPE_STABLE;

export type PollAnswer = { id: string; text: string };

export type PollStart = {
  question: string;
  answers: PollAnswer[];
  disclosed: boolean;
  maxSelections: number;
};

const readText = (node: unknown): string => {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const obj = node as Record<string, unknown>;
  const value = TEXT_KEYS.map((key) => obj[key]).find((v) => v !== undefined);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const plain = value.find((part) => !part?.mimetype || part.mimetype === 'text/plain');
    if (typeof plain?.body === 'string') return plain.body;
  }
  return typeof obj.body === 'string' ? obj.body : '';
};

export const parsePollStart = (content: IContent): PollStart | undefined => {
  const raw = content[POLL_START_TYPE_STABLE] ?? content[POLL_START_TYPE];
  if (!raw || typeof raw !== 'object') return undefined;

  const question = readText(raw.question);
  const answers: PollAnswer[] = (Array.isArray(raw.answers) ? raw.answers : [])
    .filter((a: { id?: unknown }) => typeof a?.id === 'string')
    .map((a: { id: string }) => ({ id: a.id, text: readText(a) }));
  if (!question || answers.length === 0) return undefined;

  const maxSelections =
    Number.isInteger(raw.max_selections) && raw.max_selections > 0 ? raw.max_selections : 1;

  return {
    question,
    answers,
    disclosed: raw.kind !== POLL_KIND_UNDISCLOSED && raw.kind !== 'm.poll.undisclosed',
    maxSelections: Math.min(maxSelections, answers.length),
  };
};

export const getPollPreviewText = (content: IContent): string | undefined => {
  const poll = parsePollStart(content);
  return poll ? `Опрос: ${poll.question}` : undefined;
};

const makeAnswerId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export type NewPoll = {
  question: string;
  answers: string[];
  disclosed: boolean;
  maxSelections: number;
};

/** Состав события как у Element: текстовая заглушка нужна клиентам без поддержки опросов. */
export const buildPollStartContent = (poll: NewPoll): IContent => {
  const answers = poll.answers.map((text) => ({
    id: makeAnswerId(),
    'org.matrix.msc1767.text': text,
  }));
  const fallback = [
    poll.question,
    ...answers.map((a, i) => `${i + 1}. ${a['org.matrix.msc1767.text']}`),
  ];
  const fallbackText = fallback.join('\n');

  return {
    body: fallbackText,
    'org.matrix.msc1767.text': fallbackText,
    [POLL_START_TYPE]: {
      question: {
        'org.matrix.msc1767.text': poll.question,
        body: poll.question,
        msgtype: 'm.text',
      },
      kind: poll.disclosed ? POLL_KIND_DISCLOSED : POLL_KIND_UNDISCLOSED,
      max_selections: poll.maxSelections,
      answers,
    },
  };
};

export const buildPollResponseContent = (pollId: string, answerIds: string[]): IContent => ({
  'm.relates_to': { rel_type: 'm.reference', event_id: pollId },
  [POLL_RESPONSE_TYPE]: { answers: answerIds },
});

export const buildPollEndContent = (pollId: string): IContent => ({
  'm.relates_to': { rel_type: 'm.reference', event_id: pollId },
  [POLL_END_TYPE]: {},
  'org.matrix.msc1767.text': 'Опрос завершён',
  body: 'Опрос завершён',
});

export type PollVote = { sender: string; ts: number; answers: string[] };

export const parsePollVote = (
  sender: string,
  ts: number,
  content: IContent
): PollVote | undefined => {
  const body = content[POLL_RESPONSE_TYPE] ?? content['m.poll.response'];
  if (!body || typeof body !== 'object') return undefined;
  const answers = Array.isArray(body.answers)
    ? body.answers.filter((a: unknown) => typeof a === 'string')
    : [];
  return { sender, ts, answers };
};

export type PollTally = {
  counts: Record<string, number>;
  /** Сколько человек проголосовало (без испорченных бюллетеней). */
  voters: number;
  /** Текущий выбор каждого участника: userId → ids ответов. */
  choices: Map<string, string[]>;
};

/**
 * Считаются только последние голоса каждого участника, не позже закрытия.
 * Бюллетень с неизвестным ответом или с превышением max_selections не засчитывается (MSC3381).
 */
export const tallyPoll = (poll: PollStart, votes: PollVote[], endTs?: number): PollTally => {
  const valid = new Set(poll.answers.map((a) => a.id));
  const latest = new Map<string, PollVote>();
  votes.forEach((vote) => {
    if (endTs !== undefined && vote.ts > endTs) return;
    const prev = latest.get(vote.sender);
    if (!prev || prev.ts <= vote.ts) latest.set(vote.sender, vote);
  });

  const counts: Record<string, number> = {};
  poll.answers.forEach((a) => {
    counts[a.id] = 0;
  });
  const choices = new Map<string, string[]>();

  latest.forEach((vote, sender) => {
    const answers = Array.from(new Set(vote.answers));
    const spoiled =
      answers.length === 0 ||
      answers.length > poll.maxSelections ||
      answers.some((id) => !valid.has(id));
    if (spoiled) return;
    choices.set(sender, answers);
    answers.forEach((id) => {
      counts[id] += 1;
    });
  });

  return { counts, voters: choices.size, choices };
};

export const toggleChoice = (current: string[], answerId: string, maxSelections: number) => {
  if (maxSelections === 1) return [answerId];
  if (current.includes(answerId)) return current.filter((id) => id !== answerId);
  if (current.length >= maxSelections) return current;
  return [...current, answerId];
};
