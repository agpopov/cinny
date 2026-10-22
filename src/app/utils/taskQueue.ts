/** A FIFO shared by all rooms: large buffers must not multiply with open editors. */
export const createTaskQueue = (concurrency: number) => {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency');
  let active = 0;
  const pending: (() => void)[] = [];
  const run = () => {
    while (active < concurrency && pending.length) pending.shift()!();
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      pending.push(() => {
        active += 1;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            run();
          });
      });
      run();
    });
};

export const prepareAttachment = createTaskQueue(1);
export const transferAttachment = createTaskQueue(2);
