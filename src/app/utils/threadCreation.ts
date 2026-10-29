import type { MatrixClient } from 'matrix-js-sdk';
import { MsgType, RelationType } from 'matrix-js-sdk';
import { PrivateStorage, privateAccountKey } from './privateStorage';

type MessageContent = Parameters<MatrixClient['sendMessage']>[2];
type Storage = Pick<PrivateStorage, 'get' | 'set'>;

export const THREAD_NAME_MAX_LENGTH = 100;
export const getNewThreadDraftKey = (roomId: string) => `${roomId}#new-thread`;

export const buildThreadRootContent = (title: string): MessageContent => {
  const name = title.trim();
  if (!name || name.length > THREAD_NAME_MAX_LENGTH)
    throw new Error(`Название треда должно содержать от 1 до ${THREAD_NAME_MAX_LENGTH} символов.`);
  return { msgtype: MsgType.Text, body: name, 'm.mentions': {} };
};

export type ThreadCreationState = {
  title: string;
  content: MessageContent;
  rootTxn: string;
  replyTxn: string;
  rootId?: string;
  replyId?: string;
};

/** Two standard Matrix messages, with durable transaction IDs for both sends. */
export class ThreadCreationAttempt {
  private readonly storage: Storage;

  private readonly roomId: string;

  private busy = false;

  constructor(storage: Storage, roomId: string) {
    this.storage = storage;
    this.roomId = roomId;
  }

  load() {
    return this.storage.get<ThreadCreationState>(this.roomId);
  }

  private async sendMessage(
    mx: MatrixClient,
    threadId: string | null,
    content: MessageContent,
    txnId: string
  ) {
    const room = mx.getRoom(this.roomId);
    const pending = room?.getEventForTxnId(txnId);
    const confirmed = room
      ?.getLiveTimeline()
      .getEvents()
      .find(
        (event) =>
          event.getSender() === mx.getUserId() &&
          event.getUnsigned().transaction_id === txnId &&
          !event.status
      );
    const accepted = confirmed ?? (pending?.status === 'sent' ? pending : undefined);
    const id = accepted?.getId();
    if (id) return id;
    if (pending && pending.status !== 'not_sent')
      throw new Error('Предыдущая отправка ещё выполняется. Дождитесь результата.');
    const message = structuredClone(content);
    if (threadId) {
      Object.assign(message, {
        'm.relates_to': {
          rel_type: RelationType.Thread,
          event_id: threadId,
          'm.in_reply_to': { event_id: threadId },
          is_falling_back: true,
        },
      });
    }
    const response =
      pending && room
        ? await mx.resendEvent(pending, room)
        : await mx.sendMessage(this.roomId, threadId, message, txnId);
    return response.event_id;
  }

  async send(
    mx: MatrixClient,
    title: string,
    content: MessageContent,
    expectedRootTxn?: string
  ): Promise<string> {
    if (this.busy) throw new Error('Тред уже создаётся.');
    this.busy = true;
    try {
      const root = buildThreadRootContent(title);
      if (!content.body?.trim() || content['m.relates_to'])
        throw new Error('Напишите первое сообщение нового треда.');
      let state = await this.load();
      if (expectedRootTxn && state?.rootTxn !== expectedRootTxn)
        throw new Error('Эта попытка уже завершена. Откройте созданный тред в списке обсуждений.');
      if (
        state &&
        (state.title !== root.body || JSON.stringify(state.content) !== JSON.stringify(content))
      )
        throw new Error('Сначала завершите предыдущую попытку создания треда.');
      state ??= {
        title: root.body,
        content: structuredClone(content),
        rootTxn: mx.makeTxnId(),
        replyTxn: mx.makeTxnId(),
      };
      // Persist before dispatch. A lost response or a failed checkpoint can
      // repeat the HTTP request, but cannot create a second root or first reply.
      await this.storage.set(this.roomId, state);
      if (!state.rootId) {
        state.rootId = await this.sendMessage(mx, null, root, state.rootTxn);
        await this.storage.set(this.roomId, state);
      }
      if (!state.replyId) {
        state.replyId = await this.sendMessage(mx, state.rootId, state.content, state.replyTxn);
        await this.storage.set(this.roomId, state);
      }
      return state.rootId;
    } finally {
      this.busy = false;
    }
  }

  async clear() {
    if (this.busy) throw new Error('Дождитесь завершения создания треда.');
    await this.storage.set(this.roomId, undefined);
  }
}

const attempts = new WeakMap<MatrixClient, Map<string, ThreadCreationAttempt>>();
export const getThreadCreationAttempt = (mx: MatrixClient, roomId: string) => {
  let account = attempts.get(mx);
  if (!account) {
    account = new Map();
    attempts.set(mx, account);
  }
  let attempt = account.get(roomId);
  if (!attempt) {
    attempt = new ThreadCreationAttempt(
      new PrivateStorage(
        privateAccountKey(mx.baseUrl, mx.getSafeUserId(), mx.getDeviceId() ?? ''),
        'thread-creation'
      ),
      roomId
    );
    account.set(roomId, attempt);
  }
  return attempt;
};
