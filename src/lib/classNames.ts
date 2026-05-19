import { clsx, type ClassValue } from "clsx";

export function classNames(...values: ClassValue[]) {
  return clsx(values);
}
