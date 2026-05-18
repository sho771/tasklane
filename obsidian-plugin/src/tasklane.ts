export type TasklaneTaskKind = 'note' | 'line';

export type TasklaneTask = {
  id: string;
  kind: TasklaneTaskKind;
  name: string;
  path: string;
  line?: number;
  status: 'todo' | 'doing' | 'done';
  start: string;
  end: string;
  progress: number;
  tags: string[];
  rawLine?: string;
};

export type TasklaneSettings = {
  taskFolder: string;
  defaultTag: string;
  fileNamePattern: string;
};

export const DEFAULT_SETTINGS: TasklaneSettings = {
  taskFolder: 'Tasklane',
  defaultTag: 'task',
  fileNamePattern: '{date}_{name}'
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateKey(input: Date | string): string {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(input: Date | string, days: number): Date {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

export function createUid(input = new Date()): string {
  const date = new Date(input);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hour}${minute}${second}`;
}

export function normalizeTag(rawTag: unknown): string {
  const value = String(rawTag || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
  return value;
}

export function normalizeTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) {
    return [...new Set(rawTags.map(normalizeTag).filter(Boolean))];
  }
  if (typeof rawTags === 'string') {
    const parsed = rawTags
      .replace(/^\[|\]$/g, '')
      .split(/[,\s]+/)
      .map((tag) => tag.replace(/^["']|["']$/g, ''));
    return [...new Set(parsed.map(normalizeTag).filter(Boolean))];
  }
  return [];
}

export function normalizeStatus(rawStatus: unknown, progress = 0): TasklaneTask['status'] {
  const value = String(rawStatus || '').trim().toLowerCase();
  if (value === 'todo' || value === 'doing' || value === 'done') {
    return value;
  }
  if (Number(progress) >= 100) {
    return 'done';
  }
  if (Number(progress) > 0) {
    return 'doing';
  }
  return 'todo';
}

function clampProgress(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(parsed), 0), 100);
}

function parseDateFromText(text: string): string | null {
  const match = text.match(/(?:📅\s*)?(\d{4})[-/](\d{1,2})[-/](\d{1,2})/u);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return toDateKey(date);
}

function parseEmojiDate(text: string, marker: string): string | null {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escapedMarker}\\s*(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})`, 'u'));
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return toDateKey(date);
}

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const normalized = String(content || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: '', body: normalized };
  }
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: '', body: normalized };
  }
  return {
    frontmatter: normalized.slice(4, end),
    body: normalized.slice(end + 5)
  };
}

function parseMetaValue(value: string): unknown {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (raw === 'null') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  if (/^\[.*\]$/.test(raw)) {
    try {
      return JSON.parse(raw.replace(/'/g, '"'));
    } catch {
      return raw;
    }
  }
  return raw.replace(/^["']|["']$/g, '');
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const lines = String(frontmatter || '').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    if (!value && index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
      const items: string[] = [];
      while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
        index += 1;
        items.push(lines[index].replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      }
      meta[key] = items;
      continue;
    }
    meta[key] = parseMetaValue(value);
  }
  return meta;
}

function firstHeading(body: string): string {
  const match = String(body || '').match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

export function parseTasklaneNote(content: string, path: string): TasklaneTask | null {
  const { frontmatter, body } = splitFrontmatter(content);
  const meta = parseFrontmatter(frontmatter);
  if (meta.tasklane !== true) {
    return null;
  }
  const progress = clampProgress(meta.progress);
  const fallbackName = path.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled task';
  const name = String(meta.name || firstHeading(body) || fallbackName).trim();
  const start = typeof meta.start === 'string' ? meta.start : toDateKey(new Date());
  const end = typeof meta.end === 'string' ? meta.end : start;
  return {
    id: `note:${path}`,
    kind: 'note',
    name,
    path,
    status: normalizeStatus(meta.status, progress),
    start,
    end,
    progress,
    tags: normalizeTags(meta.tags)
  };
}

export function parseTasklaneLine(lineText: string, path: string, lineNumber: number): TasklaneTask | null {
  const match = String(lineText || '').match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.+)$/u);
  if (!match) {
    return null;
  }
  const body = match[2].trim();
  if (!/#task(?:\b|\/)/iu.test(body) || /#tasklane\/hidden\b/iu.test(body)) {
    return null;
  }
  const done = match[1].toLowerCase() === 'x';
  const tags = normalizeTags((body.match(/#[^\s#,]+/gu) || []).map((tag) => tag.slice(1)));
  const fallbackDate = parseDateFromText(body);
  const startDate = parseEmojiDate(body, '🛫') || fallbackDate;
  const dueDate = parseEmojiDate(body, '📅') || fallbackDate;
  const today = toDateKey(new Date());
  const name = body
    .replace(/#[^\s#,]+/gu, ' ')
    .replace(/🛫\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}/gu, ' ')
    .replace(/📅\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}/gu, ' ')
    .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/u, ' ')
    .replace(/\s+/g, ' ')
    .trim() || `Task from ${path}`;
  return {
    id: `line:${path}:${lineNumber}`,
    kind: 'line',
    name,
    path,
    line: lineNumber,
    status: done ? 'done' : 'todo',
    start: startDate || dueDate || today,
    end: dueDate || startDate || toDateKey(addDays(today, 2)),
    progress: done ? 100 : 0,
    tags,
    rawLine: lineText
  };
}

export function parseTasklaneLines(content: string, path: string): TasklaneTask[] {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line, index) => {
      const task = parseTasklaneLine(line, path, index + 1);
      return task ? [task] : [];
    });
}

export function buildTaskNoteMarkdown(name: string, settings: TasklaneSettings): string {
  const today = toDateKey(new Date());
  const end = toDateKey(addDays(today, 2));
  const tag = normalizeTag(settings.defaultTag) || DEFAULT_SETTINGS.defaultTag;
  return [
    '---',
    'tasklane: true',
    `uid: "${createUid()}"`,
    'status: todo',
    `start: ${today}`,
    `end: ${end}`,
    'progress: 0',
    'tags:',
    `  - ${tag}`,
    'dependsOn: []',
    '---',
    '',
    `# ${name}`,
    ''
  ].join('\n');
}

export function sanitizeFileName(input: string): string {
  return String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80) || 'task';
}

export function buildTaskFileName(name: string, settings: TasklaneSettings): string {
  const safeName = sanitizeFileName(name);
  const date = toDateKey(new Date()).replace(/-/g, '');
  const base = String(settings.fileNamePattern || DEFAULT_SETTINGS.fileNamePattern)
    .replace(/\{date\}/g, date)
    .replace(/\{name\}/g, safeName);
  return `${sanitizeFileName(base)}.md`;
}
