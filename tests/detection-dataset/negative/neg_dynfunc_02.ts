// Template rendering with a fixed set of placeholders. The template is
// data: it is substituted, never compiled or executed.
const TOKEN_RE = /\{\{(\w+)\}\}/g;

export function render(source: string, data: Record<string, string>): string {
  return source.replace(TOKEN_RE, (_match, key) => data[key] ?? '');
}
