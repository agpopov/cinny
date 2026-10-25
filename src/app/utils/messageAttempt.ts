import type { MatrixClient } from 'matrix-js-sdk';
import { PrivateStorage, privateAccountKey } from './privateStorage';

type RoomMessageEventContent = Parameters<MatrixClient['sendMessage']>[2];
type Attempt = { txnId: string; content: RoomMessageEventContent; fingerprint: string };
type AttemptStorage = Pick<PrivateStorage, 'get' | 'set'>;

/** Reuse the Matrix transaction and local echo after an uncertain HTTP result. */
export class MessageAttempt {
  private attempt?: Attempt;

  private readonly storage?: AttemptStorage;

  private readonly key: string;

  constructor(storage?: AttemptStorage, key = '') {
    this.storage = storage;
    this.key = key;
  }

  private busy = false;

  get pending() {
    return !!this.attempt;
  }

  async send(
    mx: MatrixClient,
    roomId: string,
    threadId: string | null,
    content: RoomMessageEventContent,
    draftRevision?: string,
    onDispatch?: () => void
  ) {
    if (this.busy) throw new Error('Сообщение уже отправляется');
    this.busy = true;
    try {
      this.attempt ??= await this.storage?.get<Attempt>(this.key);
      const fingerprint = draftRevision ?? JSON.stringify(content);
      if (this.attempt && this.attempt.fingerprint !== fingerprint) {
        throw new Error(
          'Результат предыдущей отправки неизвестен. Повторите её из ленты или отмените локальную попытку перед отправкой изменённого текста.'
        );
      }
      this.attempt ??= { txnId: mx.makeTxnId(), content: structuredClone(content), fingerprint };
      // Commit the ID before HTTP dispatch so a restart can safely retry it.
      await this.storage?.set(this.key, this.attempt);
      const room = mx.getRoom(roomId);
      const pending = room?.getEventForTxnId(this.attempt.txnId);
      // Remote echoes leave the SDK's pending transaction map. After a restart
      // they may already be in the synced timeline before we retry the draft.
      const confirmed = room
        ?.getLiveTimeline()
        .getEvents()
        .find(
          (event) =>
            event.getSender() === mx.getUserId() &&
            event.getUnsigned().transaction_id === this.attempt?.txnId &&
            !event.status
        );
      const accepted = confirmed ?? (pending?.status === 'sent' ? pending : undefined);
      if (!accepted && pending && pending.status !== 'not_sent')
        throw new Error('Предыдущая попытка ещё выполняется. Дождитесь результата.');
      // The transaction is durable. Clear the composer before the SDK publishes
      // its local echo, without waiting for HTTP or encrypted storage cleanup.
      onDispatch?.();
      let response: Awaited<ReturnType<MatrixClient['sendMessage']>>;
      const confirmedId = accepted?.getId();
      if (confirmedId) {
        response = { event_id: confirmedId };
      } else if (pending && room) {
        response = await mx.resendEvent(pending, room);
      } else {
        response = await mx.sendMessage(
          roomId,
          threadId,
          structuredClone(this.attempt.content),
          this.attempt.txnId
        );
      }
      await this.storage?.set(this.key, undefined);
      this.attempt = undefined;
      return response;
    } finally {
      this.busy = false;
    }
  }

  async cancel(mx: MatrixClient, roomId: string) {
    if (this.busy) throw new Error('Дождитесь результата отправки');
    this.busy = true;
    try {
      this.attempt ??= await this.storage?.get<Attempt>(this.key);
      const pending = this.attempt
        ? mx.getRoom(roomId)?.getEventForTxnId(this.attempt.txnId)
        : undefined;
      if (pending && pending.status !== 'sent') mx.cancelPendingEvent(pending);
      await this.storage?.set(this.key, undefined);
      this.attempt = undefined;
    } finally {
      this.busy = false;
    }
  }
}
const attempts = new WeakMap<MatrixClient, Map<string, MessageAttempt>>();
export const getMessageAttempt = (mx: MatrixClient, key: string): MessageAttempt => {
  let account = attempts.get(mx);
  if (!account) {
    account = new Map();
    attempts.set(mx, account);
  }
  let attempt = account.get(key);
  if (!attempt) {
    attempt = new MessageAttempt(
      new PrivateStorage(
        privateAccountKey(mx.baseUrl, mx.getSafeUserId(), mx.getDeviceId() ?? ''),
        'send-attempts'
      ),
      key
    );
    account.set(key, attempt);
  }
  return attempt;
};

const attachments = new WeakMap<MatrixClient, WeakMap<Blob, MessageAttempt>>();
export const getAttachmentAttempt = (mx: MatrixClient, file: Blob): MessageAttempt => {
  let account = attachments.get(mx);
  if (!account) {
    account = new WeakMap();
    attachments.set(mx, account);
  }
  let attempt = account.get(file);
  if (!attempt) {
    attempt = new MessageAttempt();
    account.set(file, attempt);
  }
  return attempt;
};
