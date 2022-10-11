import { randomUIntBelowFactory } from "./random53BitValue";

// Inspired by https://reference.wolfram.com/language/ref/RandomChoice.html
// This library itself should be kept small, but a wrapper library may want to implement selecting multiple element without replacement as with replacement:
// https://reference.wolfram.com/language/ref/RandomSample.html
export async function randomChoiceFactory<T>(): Promise<(arr: T[]) => T> {
  const randomUIntBelow = await randomUIntBelowFactory();
  return (arr: T[]): T => arr[randomUIntBelow(arr.length)];
}
