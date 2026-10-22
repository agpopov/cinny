type SendAttachmentOptions<TItem, TContent> = {
  prepare: (item: TItem) => Promise<TContent>;
  send: (content: TContent) => Promise<unknown>;
  isPending: (item: TItem) => boolean;
  onSent: (item: TItem) => void;
};

export const sendAttachments = async <TItem, TContent>(
  items: TItem[],
  { prepare, send, isPending, onSent }: SendAttachmentOptions<TItem, TContent>
): Promise<unknown[]> => {
  const prepared = await Promise.allSettled(items.map(prepare));
  const failures: unknown[] = [];
  // Decode in parallel, then send in selection order. A canceled item must not
  // be sent, and only accepted messages may be removed from the composer.
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const result = prepared[index];
    if (isPending(item)) {
      try {
        if (result.status === 'rejected') throw result.reason;
        // eslint-disable-next-line no-await-in-loop
        await send(result.value);
        onSent(item);
      } catch (error) {
        failures.push(error);
      }
    }
  }
  return failures;
};
