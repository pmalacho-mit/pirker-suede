export const deferred = <T>() => {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;
  let value: T | undefined;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  promise.then((v) => (value = v));

  const resolution = (fn: (resolved: T) => void) =>
    promise.then((value) => fn(value));

  const immediate = <Condition extends "safe" | "maybe" | "unsafe", Return>(
    condition: Condition,
    fn: (
      value: Condition extends "safe" | "unsafe" ? T : T | undefined,
    ) => Return,
  ) => {
    type Returned = Condition extends "safe"
      ? Return extends void
        ? void
        : Return | undefined
      : Return;
    return condition === "safe"
      ? value !== undefined
        ? fn(value)
        : (undefined as Returned)
      : (fn(value!) as Returned);
  };

  return { promise, resolve: resolve!, reject: reject!, resolution, immediate };
};

export type Deffered<T> = ReturnType<typeof deferred<T>>;
