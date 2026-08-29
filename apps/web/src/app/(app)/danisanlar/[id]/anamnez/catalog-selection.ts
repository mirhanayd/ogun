export function appendUniqueBy<T>(items: readonly T[], item: T, key: (value: T) => string): T[] {
  const itemKey = key(item)
  return items.some((current) => key(current) === itemKey) ? [...items] : [...items, item]
}

export function removeByKey<T>(
  items: readonly T[],
  keyToRemove: string,
  key: (value: T) => string,
): T[] {
  return items.filter((item) => key(item) !== keyToRemove)
}
