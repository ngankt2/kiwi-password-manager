import type { ItemSnapshot } from './vault';

export const ENV_FIELD_ID = 'env';
export const ENV_PAGE_SIZE = 100;
export interface EnvVariable { name: string; value: string; line: number }
export interface ParsedEnv { variables: EnvVariable[]; invalidLines: number[]; duplicateNames: string[] }
export const envContent = (item: Pick<ItemSnapshot, 'fields'>) => item.fields.find((field) => field.id === ENV_FIELD_ID)?.value ?? '';

/** A display-only parser. The original text is stored verbatim; nothing is evaluated or expanded. */
export function parseEnv(source: string): ParsedEnv {
  const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
  const variables: EnvVariable[] = [];
  const invalidLines: number[] = [];
  const names = new Set<string>();
  const duplicates = new Set<string>();
  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    if (/^\s*(?:#.*)?$/.test(lines[index])) continue;
    const assignment = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*=[ \t]*(.*)$/.exec(lines[index]);
    if (!assignment) { invalidLines.push(line); continue; }
    const name = assignment[1];
    const raw = assignment[2];
    const quote = raw[0];
    let value = '';
    if (quote === '"' || quote === "'" || quote === '`') {
      const chunks: string[] = [];
      let content = raw.slice(1);
      let closed = false;
      while (true) {
        let end = -1;
        for (let cursor = 0; cursor < content.length; cursor++) {
          if (content[cursor] === '\\') { cursor++; continue; }
          if (content[cursor] === quote) { end = cursor; break; }
        }
        if (end >= 0) {
          chunks.push(content.slice(0, end));
          closed = /^[ \t]*(?:#.*)?$/.test(content.slice(end + 1));
          break;
        }
        chunks.push(content);
        if (index + 1 >= lines.length) break;
        content = lines[++index];
      }
      if (!closed) { invalidLines.push(line); continue; }
      value = chunks.join('\n');
      if (quote === '"') value = value.replace(/\\([nr"\\])/g, (_match, escape: string) => ({ n: '\n', r: '\r', '"': '"', '\\': '\\' }[escape]!));
    } else value = raw.split('#', 1)[0].trim();
    if (names.has(name)) duplicates.add(name);
    names.add(name);
    variables.push({ name, value, line });
  }
  return { variables, invalidLines, duplicateNames: [...duplicates] };
}
