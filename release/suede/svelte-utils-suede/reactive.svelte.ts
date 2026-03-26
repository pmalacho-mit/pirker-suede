export class Reactive<T> {
  value = $state() as T;

  private constructor(value?: T) {
    if (value !== undefined) this.value = value;
  }

  static Make<T>(value: T): Reactive<T>;
  static Make<T>(): Reactive<T | undefined>;
  static Make<T>(value?: T) {
    return new Reactive<T>(value);
  }
}

export const freeze = <T>(reactive: Reactive<T>) => ({
  value: $state.snapshot(reactive.value),
});
