// DETECTION TEST FIXTURE -- template renderer that compiles user templates.
export function compileTemplate(source: string): (data: unknown) => string {
  const body = 'with (data) { return `' + source + '`; }';
  return new Function('data', body) as (data: unknown) => string;
}
