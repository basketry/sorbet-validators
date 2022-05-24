export function from(lines: Iterable<string>): string {
  return Array.from(lines).join('\n');
}

let indentCount = 0;

export function* block(
  line: string,
  body: string | Iterable<string> | (() => Iterable<string>),
): Iterable<string> {
  yield line;
  yield* indent(body);
  yield 'end';
}

export function* indent(
  lines: string | Iterable<string> | (() => Iterable<string>),
): Iterable<string> {
  try {
    indentCount++;
    for (const line of typeof lines === 'function'
      ? lines()
      : typeof lines === 'string'
      ? [lines]
      : lines) {
      yield line.trim().length
        ? `${'  '.repeat(indentCount)}${line.trim()}`
        : '';
    }
  } finally {
    indentCount--;
  }
}
