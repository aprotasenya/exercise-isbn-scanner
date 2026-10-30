// node:test reporter: prints only failed tests (file:line, name, error), then a one-line summary.
export default async function* (source) {
  let pass = 0, fail = 0;
  for await (const { type, data } of source) {
    if (type === 'test:pass' && data.details?.type !== 'suite') pass++;
    if (type === 'test:fail' && data.details?.type !== 'suite') {
      fail++;
      const err = data.details?.error;
      const cause = err?.cause ?? err;
      yield `FAIL ${data.file ?? ''}:${data.line} ${data.name}\n${String(cause?.stack ?? cause).split('\n').slice(0, 12).join('\n')}\n\n`;
    }
  }
  yield `${pass} passed, ${fail} failed\n`;
}
