import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

const LiveMarkdownEditor = lazy(() => import('./LiveMarkdownEditor.jsx'));

const DAY_MS = 24 * 60 * 60 * 1000;
const TASK_ROW_HEIGHT = 52;
const GROUP_ROW_HEIGHT = 36;
const BAR_HEIGHT = 30;
const AGGREGATE_BAR_HEIGHT = 20;
const COL_WIDTH = 36;
const STORAGE_KEY = 'taskkanri.desktop.v1';
const SPLIT_KEY = 'taskkanri.desktop.splitWidth.v1';
const VAULT_PATH_KEY = 'taskkanri.desktop.vaultPath.v1';
const TAG_COLORS_KEY = 'taskkanri.desktop.tagColors.v1';
const LEGACY_GROUP_COLORS_KEY = 'taskkanri.desktop.groupColors.v1';
const THEME_KEY = 'taskkanri.desktop.theme.v1';
const SETTINGS_KEY = 'taskkanri.desktop.settings.v1';
const SORT_KEY = 'taskkanri.desktop.sortMode.v1';
const IMPORT_TAG = '#task';
const UNTAGGED_KEY = '__untagged__';
const DEFAULT_STATUS_OPTIONS = [
  { value: 'todo', label: '未着手', color: '#b43030' },
  { value: 'doing', label: '処理中', color: '#2c5b9a' },
  { value: 'done', label: '完了', color: '#2f7b4c' }
];
const DEFAULT_STATUS_VALUES = DEFAULT_STATUS_OPTIONS.map((option) => option.value);
const QUICK_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' }
];
const TASK_SORT_FIELDS = [
  { value: 'tag', label: 'Tag' },
  { value: 'due', label: 'Due' },
  { value: 'status', label: 'Status' },
  { value: 'index', label: 'No' },
  { value: 'name', label: 'Name' }
];
const DEFAULT_SORT_MODE = 'tagAsc';
const TASK_SORT_VALUES = TASK_SORT_FIELDS.flatMap((field) => [`${field.value}Asc`, `${field.value}Desc`]);
const MARKDOWN_SHORTCUT_ACTIONS = {
  bold: { label: 'Bold', defaultKey: 'Mod-b', type: 'wrap', before: '**', after: '**' },
  italic: { label: 'Italic', defaultKey: 'Mod-i', type: 'wrap', before: '*', after: '*' },
  strike: { label: 'Strikethrough', defaultKey: 'Mod-Shift-x', type: 'wrap', before: '~~', after: '~~' },
  inlineCode: { label: 'Inline code', defaultKey: 'Mod-e', type: 'wrap', before: '`', after: '`' },
  heading1: { label: 'Heading 1', defaultKey: 'Mod-Alt-1', type: 'linePrefix', prefix: '# ' },
  heading2: { label: 'Heading 2', defaultKey: 'Mod-Alt-2', type: 'linePrefix', prefix: '## ' },
  heading3: { label: 'Heading 3', defaultKey: 'Mod-Alt-3', type: 'linePrefix', prefix: '### ' },
  unorderedList: { label: 'Bullet list', defaultKey: 'Mod-Shift-8', type: 'linePrefix', prefix: '- ' },
  checklist: { label: 'Checklist', defaultKey: 'Mod-Shift-9', type: 'linePrefix', prefix: '- [ ] ' },
  quote: { label: 'Quote', defaultKey: 'Mod-Shift-.', type: 'linePrefix', prefix: '> ' },
  table: { label: 'Table', defaultKey: 'Mod-Shift-t', type: 'table' },
  currentDate: { label: 'Current date', defaultKey: 'Mod-Shift-d', type: 'currentDate' }
};
const DEFAULT_MARKDOWN_SHORTCUTS = Object.fromEntries(
  Object.entries(MARKDOWN_SHORTCUT_ACTIONS).map(([action, config]) => [action, config.defaultKey])
);
const DEFAULT_SETTINGS = {
  indexDigits: 4,
  nextTaskIndex: 1,
  fileNamePattern: '{index}_{name}',
  markdownShortcuts: DEFAULT_MARKDOWN_SHORTCUTS,
  statusOptions: DEFAULT_STATUS_OPTIONS
};
const DEFAULT_SETTINGS_SECTIONS = {
  general: true,
  shortcuts: true,
  shortcutJson: false,
  tags: false,
  statuses: false,
  vaultLog: true
};

function AppIcon({ name, size = 18 }) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  };

  if (name === 'search') {
    return (
      <svg {...commonProps}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4.2-4.2" />
      </svg>
    );
  }
  if (name === 'calendar') {
    return (
      <svg {...commonProps}>
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
      </svg>
    );
  }
  if (name === 'eraser') {
    return (
      <svg {...commonProps}>
        <path d="m7 21-4-4 10-10 8 8-6 6Z" />
        <path d="m11 7 6 6" />
        <path d="M3 21h18" />
      </svg>
    );
  }
  if (name === 'undo') {
    return (
      <svg {...commonProps}>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
      </svg>
    );
  }
  if (name === 'redo') {
    return (
      <svg {...commonProps}>
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H10a6 6 0 0 0 0 12h2" />
      </svg>
    );
  }
  return null;
}

function startOfDay(input) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateKey(input) {
  const date = startOfDay(input);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createUid(input = new Date()) {
  const date = new Date(input);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hour}${minute}${second}`;
}

function parseDateKey(value) {
  if (!value) {
    return startOfDay(new Date());
  }
  return startOfDay(`${value}T00:00:00`);
}

function addDays(input, days) {
  const date = startOfDay(input);
  date.setDate(date.getDate() + days);
  return date;
}

function daysBetween(start, end) {
  const startMs = parseDateKey(toDateKey(start)).getTime();
  const endMs = parseDateKey(toDateKey(end)).getTime();
  return Math.round((endMs - startMs) / DAY_MS);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeTaskIndex(rawIndex, fallbackIndex = 1) {
  const parsed = Number(rawIndex);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  const fallback = Number(fallbackIndex);
  return Number.isInteger(fallback) && fallback > 0 ? fallback : 1;
}

function getTaskIndex(task) {
  return normalizeTaskIndex(task?.index, task?.id);
}

function formatTaskIndex(task) {
  return String(getTaskIndex(task)).padStart(4, '0');
}

function formatTaskIndexForFile(task, indexDigits = DEFAULT_SETTINGS.indexDigits) {
  const digits = clamp(Math.round(Number(indexDigits) || DEFAULT_SETTINGS.indexDigits), 1, 8);
  return String(getTaskIndex(task)).padStart(digits, '0');
}

function getNextTaskIndex(tasks) {
  return tasks.reduce((max, task) => Math.max(max, getTaskIndex(task)), 0) + 1;
}

function normalizeMarkdownShortcuts(rawShortcuts = {}) {
  return Object.fromEntries(Object.entries(MARKDOWN_SHORTCUT_ACTIONS).map(([action, config]) => {
    const rawKey = rawShortcuts && typeof rawShortcuts[action] === 'string'
      ? rawShortcuts[action].trim()
      : '';
    return [action, rawKey || config.defaultKey];
  }));
}

function normalizeFileNamePattern(rawPattern) {
  const pattern = String(rawPattern || '').trim();
  return pattern || DEFAULT_SETTINGS.fileNamePattern;
}

function createStatusValue(label, fallback = 'status') {
  const value = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return value || fallback;
}

function createUniqueStatusValue(label, existingOptions = []) {
  const existing = new Set(existingOptions.map((option) => option.value));
  const base = createStatusValue(label || 'custom', 'custom');
  let value = base;
  let suffix = 2;
  while (existing.has(value)) {
    value = `${base}-${suffix}`;
    suffix += 1;
  }
  return value;
}

function statusColorPalette(rawColor) {
  const color = normalizeHexColor(rawColor) || DEFAULT_STATUS_OPTIONS[0].color;
  return {
    border: hexToRgba(color, 0.24),
    background: mixHex(color, '#ffffff', 0.86),
    color
  };
}

function normalizeStatusOptions(rawOptions = DEFAULT_STATUS_OPTIONS) {
  const rawList = Array.isArray(rawOptions) ? rawOptions : DEFAULT_STATUS_OPTIONS;
  const rawByValue = new Map(rawList
    .filter((option) => option && typeof option === 'object')
    .map((option) => [String(option.value || '').trim().toLowerCase(), option]));
  const used = new Set();
  const normalized = DEFAULT_STATUS_OPTIONS.map((defaultOption) => {
    const rawOption = rawByValue.get(defaultOption.value) || {};
    used.add(defaultOption.value);
    return {
      value: defaultOption.value,
      label: String(rawOption.label || defaultOption.label).trim() || defaultOption.label,
      color: normalizeHexColor(rawOption.color) || defaultOption.color
    };
  });

  rawList.forEach((option) => {
    if (!option || typeof option !== 'object') {
      return;
    }
    const value = createStatusValue(option.value || option.label);
    if (!value || used.has(value)) {
      return;
    }
    used.add(value);
    normalized.push({
      value,
      label: String(option.label || value).trim() || value,
      color: normalizeHexColor(option.color) || '#7c5cff'
    });
  });

  return normalized;
}

function buildStatusColorMap(statusOptions = DEFAULT_STATUS_OPTIONS) {
  return Object.fromEntries(normalizeStatusOptions(statusOptions).map((option) => [
    option.value,
    statusColorPalette(option.color)
  ]));
}

function buildStatusOrderMap(statusOptions = DEFAULT_STATUS_OPTIONS) {
  return Object.fromEntries(normalizeStatusOptions(statusOptions).map((option, index) => [
    option.value,
    index
  ]));
}

function normalizeSettings(rawSettings = {}) {
  return {
    indexDigits: clamp(Math.round(Number(rawSettings.indexDigits) || DEFAULT_SETTINGS.indexDigits), 1, 8),
    nextTaskIndex: normalizeTaskIndex(rawSettings.nextTaskIndex, DEFAULT_SETTINGS.nextTaskIndex),
    fileNamePattern: normalizeFileNamePattern(rawSettings.fileNamePattern),
    markdownShortcuts: normalizeMarkdownShortcuts(rawSettings.markdownShortcuts),
    statusOptions: normalizeStatusOptions(rawSettings.statusOptions)
  };
}

function loadInitialSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return normalizeSettings(parsed || DEFAULT_SETTINGS);
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

function isLegacySampleTask(rawTask) {
  const id = Number(rawTask?.id);
  const name = typeof rawTask?.name === 'string' ? rawTask.name : '';
  const tags = normalizeTags(rawTask?.tags).join(',');
  return (
    (id === 1 && name === 'Planning' && tags === 'task/core')
    || (id === 2 && name === 'UI Draft' && tags === 'task/core/ui')
    || (id === 3 && name === 'Integration' && tags === 'task/release')
  );
}

function normalizeTask(rawTask, fallbackId, statusOptions = DEFAULT_STATUS_OPTIONS) {
  const id = Number(rawTask.id) || fallbackId;
  const index = normalizeTaskIndex(rawTask.index ?? rawTask.taskIndex ?? rawTask.no, id);
  const start = rawTask.start && /^\d{4}-\d{2}-\d{2}$/.test(rawTask.start) ? rawTask.start : toDateKey(new Date());
  const endCandidate = rawTask.end && /^\d{4}-\d{2}-\d{2}$/.test(rawTask.end) ? rawTask.end : start;
  const safeEnd = parseDateKey(endCandidate) < parseDateKey(start) ? start : endCandidate;
  const progress = clamp(Number(rawTask.progress) || 0, 0, 100);
  const normalizedStatus = normalizeStatus(rawTask.status, progress, statusOptions);
  const safeProgress = normalizedStatus === 'done' ? 100 : progress;
  const status = normalizeStatus(rawTask.status, safeProgress, statusOptions);
  const parentId = rawTask.parentId == null ? null : Number(rawTask.parentId);
  const dependsOn = Array.isArray(rawTask.dependsOn)
    ? [...new Set(rawTask.dependsOn.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0 && value !== id))]
    : [];
  const uid = normalizeUid(rawTask.uid);
  const tags = normalizeTags(rawTask.tags);

  return {
    id,
    index,
    name: typeof rawTask.name === 'string' && rawTask.name.trim() ? rawTask.name : `Task ${id}`,
    start,
    end: safeEnd,
    progress: safeProgress,
    status,
    uid,
    parentId: Number.isInteger(parentId) && parentId > 0 && parentId !== id ? parentId : null,
    dependsOn,
    tags,
    sourcePath: typeof rawTask.sourcePath === 'string' ? rawTask.sourcePath : '',
    markdown: typeof rawTask.markdown === 'string'
      ? rawTask.markdown
      : [rawTask.detail, rawTask.memo].filter((value) => typeof value === 'string' && value.trim()).join('\n\n')
  };
}

function loadInitialTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const initialSettings = loadInitialSettings();
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }

    return parsed
      .filter((task) => !isLegacySampleTask(task))
      .map((task, index) => normalizeTask({
        ...task,
        index: task.index ?? task.taskIndex ?? task.no ?? index + 1
      }, index + 1, initialSettings.statusOptions));
  } catch {
    return [];
  }
}

function loadInitialSplitWidth() {
  const fallback = Math.round(window.innerWidth * 0.33);
  const parsed = Number(localStorage.getItem(SPLIT_KEY));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeHexColor(raw) {
  const value = String(raw || '').trim();
  if (/^#[\da-f]{6}$/i.test(value)) {
    return value.toLowerCase();
  }
  if (/^#[\da-f]{3}$/i.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '';
}

function normalizeTagPath(rawTagPath) {
  const value = String(rawTagPath || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
  return value || UNTAGGED_KEY;
}

function loadInitialTagColors() {
  try {
    const raw = localStorage.getItem(TAG_COLORS_KEY) || localStorage.getItem(LEGACY_GROUP_COLORS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([tagPath, color]) => [normalizeTagPath(tagPath), normalizeHexColor(color)])
        .filter(([, color]) => Boolean(color))
    );
  } catch {
    return {};
  }
}

function hexToRgb(hexColor) {
  const hex = normalizeHexColor(hexColor);
  if (!hex) {
    return null;
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(baseHex, mixWithHex, mixRatio) {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(mixWithHex);
  if (!base || !target) {
    return '#8ecab5';
  }
  const ratio = clamp(Number(mixRatio) || 0, 0, 1);
  return rgbToHex(
    base.r * (1 - ratio) + target.r * ratio,
    base.g * (1 - ratio) + target.g * ratio,
    base.b * (1 - ratio) + target.b * ratio
  );
}

function hexToRgba(hexColor, alpha = 1) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) {
    return 'rgba(47, 143, 121, 0.26)';
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(Number(alpha) || 0, 0, 1)})`;
}

function hslToHex(h, s, l) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const sat = clamp(Number(s) / 100, 0, 1);
  const lig = clamp(Number(l) / 100, 0, 1);
  const c = (1 - Math.abs((2 * lig) - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - (c / 2);

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function rgbToHsl(r, g, b) {
  const red = clamp(Number(r), 0, 255) / 255;
  const green = clamp(Number(g), 0, 255) / 255;
  const blue = clamp(Number(b), 0, 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs((2 * lightness) - 1));
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * (((blue - red) / delta) + 2);
    } else {
      hue = 60 * (((red - green) / delta) + 4);
    }
  }

  return {
    h: (hue + 360) % 360,
    s: saturation * 100,
    l: lightness * 100
  };
}

function complementHex(hexColor) {
  const rgb = hexToRgb(hexColor);
  if (!rgb) {
    return '#c45f2c';
  }
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return hslToHex((hsl.h + 180) % 360, hsl.s, hsl.l);
}

function toDependsText(dependsOn) {
  return dependsOn.join(',');
}

function parseDependsText(raw, taskId) {
  return [...new Set(
    raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0 && value !== taskId)
  )];
}

function clampLeftWidth(rawWidth, containerWidth) {
  const minLeft = 320;
  const minRight = 480;
  const maxLeft = Math.max(minLeft, containerWidth - minRight);
  return clamp(rawWidth, minLeft, maxLeft);
}

function getPathBaseName(inputPath) {
  const parts = String(inputPath || '').split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

function sanitizePathSegment(input, fallback = 'task') {
  const value = String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
  return value || fallback;
}

function getTaskFolderPath(task) {
  const primaryTag = getPrimaryTagPath(task);
  if (primaryTag === UNTAGGED_KEY) {
    return 'NoTag';
  }
  return primaryTag
    .split('/')
    .filter(Boolean)
    .map((part) => sanitizePathSegment(part, 'tag'))
    .join('/');
}

function buildTaskFileBaseName(task, settings = DEFAULT_SETTINGS) {
  const pattern = normalizeFileNamePattern(settings.fileNamePattern);
  const statusOptions = normalizeStatusOptions(settings.statusOptions);
  const paddedIndex = formatTaskIndexForFile(task, settings.indexDigits);
  const rawBase = pattern
    .replace(/\{index\}/g, paddedIndex)
    .replace(/\{no\}/g, String(getTaskIndex(task)))
    .replace(/\{id\}/g, String(task.id))
    .replace(/\{name\}/g, String(task.name || `Task ${paddedIndex}`))
    .replace(/\{uid\}/g, String(task.uid || ''))
    .replace(/\{status\}/g, normalizeStatus(task.status, task.progress, statusOptions));
  return sanitizePathSegment(rawBase, `${paddedIndex}_${task.name || `Task ${paddedIndex}`}`);
}

function getTaskMarkdownRelativePath(task, settings = DEFAULT_SETTINGS) {
  const folderPath = getTaskFolderPath(task);
  return `${folderPath}/${buildTaskFileBaseName(task, settings)}.md`;
}

function quoteMetaValue(value) {
  return JSON.stringify(String(value ?? ''));
}

function buildTaskMarkdown(task, settings = DEFAULT_SETTINGS) {
  const statusOptions = normalizeStatusOptions(settings.statusOptions);
  const depends = Array.isArray(task.dependsOn)
    ? task.dependsOn.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const tags = normalizeTags(task.tags);
  const markdownBody = typeof task.markdown === 'string' ? task.markdown.trim() : '';

  return [
    '---',
    'taskkanri: true',
    `id: ${task.id}`,
    `index: ${getTaskIndex(task)}`,
    `uid: ${quoteMetaValue(task.uid || '')}`,
    `name: ${quoteMetaValue(task.name)}`,
    `status: ${quoteMetaValue(normalizeStatus(task.status, task.progress, statusOptions))}`,
    `start: ${task.start}`,
    `end: ${task.end}`,
    `progress: ${clamp(Number(task.progress) || 0, 0, 100)}`,
    `tags: ${JSON.stringify(tags)}`,
    `parentId: ${task.parentId == null ? 'null' : Number(task.parentId)}`,
    `dependsOn: [${depends.join(', ')}]`,
    '---',
    '',
    `# ${task.name}`,
    '',
    markdownBody
  ].join('\n');
}

function buildTaskMarkdownFiles(tasks, settings = DEFAULT_SETTINGS) {
  const usedNames = new Set();
  return tasks.map((task) => {
    const safePath = getTaskMarkdownRelativePath(task, settings);
    const dotIndex = safePath.toLowerCase().lastIndexOf('.md');
    const safeBase = dotIndex >= 0 ? safePath.slice(0, dotIndex) : safePath;
    let fileName = `${safeBase}.md`;
    let suffix = 2;
    while (usedNames.has(fileName)) {
      fileName = `${safeBase}_${suffix}.md`;
      suffix += 1;
    }
    usedNames.add(fileName);
    return {
      relativePath: fileName,
      content: buildTaskMarkdown(task, settings)
    };
  });
}

function splitFrontmatter(content) {
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

function parseMetaValue(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (raw === 'null') {
    return null;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
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

  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith('\'') && raw.endsWith('\''))) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  return raw;
}

function parseFrontmatterBlock(frontmatter) {
  const meta = {};
  String(frontmatter || '')
    .split('\n')
    .forEach((line) => {
      const index = line.indexOf(':');
      if (index <= 0) {
        return;
      }
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (!key) {
        return;
      }
      meta[key] = parseMetaValue(value);
    });

  return meta;
}

function parseDependsMeta(dependsValue, taskId) {
  if (Array.isArray(dependsValue)) {
    return [...new Set(dependsValue.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0 && value !== taskId))];
  }
  if (typeof dependsValue === 'string') {
    return parseDependsText(dependsValue, taskId);
  }
  return [];
}

function normalizeUid(rawUid) {
  const value = String(rawUid || '').trim();
  return /^\d{14}$/.test(value) ? value : '';
}

function normalizeStatus(rawStatus, progress = 0, statusOptions = DEFAULT_STATUS_OPTIONS) {
  const value = String(rawStatus || '').trim().toLowerCase();
  const statusValues = new Set(normalizeStatusOptions(statusOptions).map((option) => option.value));
  if (statusValues.has(value)) {
    return value;
  }
  if (value === '未着手') {
    return 'todo';
  }
  if (value === '処理中') {
    return 'doing';
  }
  if (value === '完了') {
    return 'done';
  }
  const customValue = createStatusValue(value, '');
  if (customValue && statusValues.has(customValue)) {
    return customValue;
  }
  if (Number(progress) >= 100) {
    return 'done';
  }
  if (Number(progress) > 0) {
    return 'doing';
  }
  return 'todo';
}

function statusProgressValue(status, fallbackProgress = 0) {
  if (status === 'todo') {
    return 0;
  }
  if (status === 'doing') {
    return 50;
  }
  if (status === 'done') {
    return 100;
  }
  return clamp(Number(fallbackProgress) || 0, 0, 100);
}

function StatusDropdown({
  value,
  onChange,
  className = '',
  statusOptions = DEFAULT_STATUS_OPTIONS,
  statusColorMap = buildStatusColorMap(statusOptions)
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const options = normalizeStatusOptions(statusOptions);
  const currentStatus = normalizeStatus(value, 0, options);
  const currentOption = options.find((option) => option.value === currentStatus) || options[0];
  const currentColors = statusColorMap[currentStatus] || statusColorPalette(currentOption.color);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`status-dropdown ${isOpen ? 'is-open' : ''} ${className}`} ref={rootRef}>
      <button
        type="button"
        className="status-chip"
        style={{
          borderColor: currentColors.border,
          backgroundColor: currentColors.background,
          color: currentColors.color,
          '--status-border': currentColors.border,
          '--status-bg': currentColors.background,
          '--status-fg': currentColors.color
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="status-chip-dot" style={{ backgroundColor: currentColors.color }} />
        <span className="status-chip-label" style={{ color: currentColors.color }}>{currentOption.label}</span>
        <span className="status-chip-caret" style={{ color: currentColors.color }}>▾</span>
      </button>
      {isOpen && (
        <div className="status-menu" role="listbox" aria-label="Status">
          {options.map((option) => {
            const optionColors = statusColorMap[option.value] || statusColorPalette(option.color);
            return (
              <button
                type="button"
                key={option.value}
                role="option"
                aria-selected={option.value === currentStatus}
                className={`status-option ${option.value === currentStatus ? 'selected' : ''}`}
                style={{
                  borderColor: optionColors.border,
                  backgroundColor: optionColors.background,
                  color: optionColors.color,
                  '--status-border': optionColors.border,
                  '--status-bg': optionColors.background,
                  '--status-fg': optionColors.color
                }}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className="status-chip-dot" style={{ backgroundColor: optionColors.color }} />
                <span style={{ color: optionColors.color }}>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function createPaletteFromBaseHex(baseHex) {
  const normalized = normalizeHexColor(baseHex) || '#8ecab5';
  return {
    baseHex: normalized,
    soft: mixHex(normalized, '#ffffff', 0.8),
    base: normalized,
    strong: mixHex(normalized, '#1d2f33', 0.38),
    fill: hexToRgba(normalized, 0.26)
  };
}

function getTagPalette(tagPath, tagColors = {}) {
  const key = normalizeTagPath(tagPath);
  const customColor = normalizeHexColor(tagColors[key]);
  if (customColor) {
    return createPaletteFromBaseHex(customColor);
  }

  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(index);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return createPaletteFromBaseHex(hslToHex(hue, 54, 54));
}

function normalizeTags(rawTags) {
  const list = Array.isArray(rawTags)
    ? rawTags
    : (typeof rawTags === 'string'
      ? rawTags.split(/[,\s]+/)
      : []);
  return [...new Set(
    list
      .map((tag) => String(tag || '').trim().replace(/^#+/, ''))
      .map((tag) => tag.replace(/[,\s]+/g, ''))
      .filter(Boolean)
  )];
}

function parseTagsInput(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return [];
  }
  return normalizeTags(text.split(/[,\s]+/));
}

function mergeTags(currentTags, incomingTags) {
  return [...new Set([...normalizeTags(currentTags), ...normalizeTags(incomingTags)])];
}

function appendChildTag(currentTags, rawChildPath) {
  const tags = normalizeTags(currentTags);
  const baseTag = tags[tags.length - 1];
  const childPath = normalizeTagPath(rawChildPath);
  if (!baseTag || childPath === UNTAGGED_KEY) {
    return tags;
  }

  return [
    ...tags.slice(0, -1),
    normalizeTagPath(`${baseTag}/${childPath}`)
  ];
}

function mergeModalTags(currentTags, rawDraft) {
  const text = String(rawDraft || '').trim();
  if (!text) {
    return normalizeTags(currentTags);
  }

  if (text.startsWith('/')) {
    return appendChildTag(currentTags, text);
  }

  const incomingTags = parseTagsInput(text);
  if (incomingTags.length === 0) {
    return normalizeTags(currentTags);
  }

  return mergeTags(currentTags, incomingTags);
}

function getPrimaryTagPath(task) {
  const tags = normalizeTags(task?.tags);
  return tags.length > 0 ? normalizeTagPath(tags[0]) : UNTAGGED_KEY;
}

function tagLabel(tagPath) {
  if (tagPath === UNTAGGED_KEY) {
    return '(No Tag)';
  }
  return `#${tagPath}`;
}

function tagGroupLabel(tagPath) {
  if (tagPath === UNTAGGED_KEY) {
    return '(No Tag)';
  }
  const parts = normalizeTagPath(tagPath).split('/').filter(Boolean);
  if (parts.length <= 1) {
    return `#${parts[0]}`;
  }
  return `/${parts[parts.length - 1]}`;
}

function tagDepth(tagPath) {
  if (!tagPath || tagPath === UNTAGGED_KEY) {
    return 0;
  }
  return tagPath.split('/').filter(Boolean).length - 1;
}

function findRowIndexAtOffset(offset, rowMetrics) {
  if (!Array.isArray(rowMetrics) || rowMetrics.length === 0) {
    return 0;
  }
  const safeOffset = Math.max(0, Number(offset) || 0);
  for (let index = 0; index < rowMetrics.length; index += 1) {
    const metric = rowMetrics[index];
    if (safeOffset < metric.top + metric.height) {
      return index;
    }
  }
  return rowMetrics.length - 1;
}

function compareTagPath(a, b) {
  if (a === UNTAGGED_KEY && b !== UNTAGGED_KEY) {
    return 1;
  }
  if (a !== UNTAGGED_KEY && b === UNTAGGED_KEY) {
    return -1;
  }
  return a.localeCompare(b, 'ja');
}

function isTagPathMatch(targetPath, filterPath) {
  if (filterPath === 'all') {
    return true;
  }
  if (filterPath === UNTAGGED_KEY) {
    return targetPath === UNTAGGED_KEY;
  }
  return targetPath === filterPath || targetPath.startsWith(`${filterPath}/`);
}

function isTaskInQuickFilter(task, quickFilter, todayKey, statusOptions = DEFAULT_STATUS_OPTIONS) {
  if (!quickFilter || quickFilter === 'all') {
    return true;
  }
  const status = normalizeStatus(task.status, task.progress, statusOptions);
  const taskStart = parseDateKey(task.start).getTime();
  const taskEnd = parseDateKey(task.end).getTime();
  const todayStart = parseDateKey(todayKey).getTime();

  if (quickFilter === 'overdue') {
    return taskEnd < todayStart && status !== 'done';
  }
  if (quickFilter === 'today') {
    return taskStart <= todayStart && taskEnd >= todayStart;
  }
  if (quickFilter === 'week') {
    const weekEnd = addDays(todayKey, 6).getTime();
    return taskStart <= weekEnd && taskEnd >= todayStart;
  }
  return true;
}

function taskMatchesSearch(task, query) {
  const trimmed = String(query || '').trim().toLowerCase();
  if (!trimmed) {
    return true;
  }
  const haystack = [
    task.name,
    task.uid,
    task.status,
    String(task.id),
    String(getTaskIndex(task)),
    normalizeTags(task.tags).join(' '),
    task.markdown
  ].join(' ').toLowerCase();
  return haystack.includes(trimmed);
}

function normalizeSortMode(rawSortMode) {
  return TASK_SORT_VALUES.includes(rawSortMode) ? rawSortMode : DEFAULT_SORT_MODE;
}

function getSortField(sortMode) {
  return normalizeSortMode(sortMode).replace(/(Asc|Desc)$/u, '');
}

function getSortDirection(sortMode) {
  return normalizeSortMode(sortMode).endsWith('Desc') ? 'Desc' : 'Asc';
}

function buildSortMode(field, direction) {
  const safeField = TASK_SORT_FIELDS.some((option) => option.value === field) ? field : 'due';
  const safeDirection = direction === 'Desc' ? 'Desc' : 'Asc';
  return normalizeSortMode(`${safeField}${safeDirection}`);
}

function compareTasksBySortMode(a, b, sortMode = DEFAULT_SORT_MODE, statusOptions = DEFAULT_STATUS_OPTIONS) {
  const compareNumber = (left, right) => left - right;
  const compareText = (left, right) => String(left || '').localeCompare(String(right || ''), 'ja', { numeric: true });
  const byId = compareNumber(a.id, b.id);
  const startCompare = compareNumber(parseDateKey(a.start).getTime(), parseDateKey(b.start).getTime());
  const dueCompare = compareNumber(parseDateKey(a.end).getTime(), parseDateKey(b.end).getTime());
  const indexCompare = compareNumber(getTaskIndex(a), getTaskIndex(b));
  const nameCompare = compareText(a.name, b.name);
  const tagCompare = compareTagPath(getPrimaryTagPath(a), getPrimaryTagPath(b));
  const statusOrder = buildStatusOrderMap(statusOptions);
  const statusCompare = compareNumber(
    statusOrder[normalizeStatus(a.status, a.progress, statusOptions)] ?? 999,
    statusOrder[normalizeStatus(b.status, b.progress, statusOptions)] ?? 999
  );

  if (sortMode === 'dueAsc') {
    return dueCompare || startCompare || indexCompare || byId;
  }
  if (sortMode === 'dueDesc') {
    return -dueCompare || startCompare || indexCompare || byId;
  }
  if (sortMode === 'indexAsc') {
    return indexCompare || startCompare || byId;
  }
  if (sortMode === 'indexDesc') {
    return -indexCompare || startCompare || byId;
  }
  if (sortMode === 'tagAsc') {
    return tagCompare || dueCompare || indexCompare || byId;
  }
  if (sortMode === 'tagDesc') {
    return -tagCompare || dueCompare || indexCompare || byId;
  }
  if (sortMode === 'nameAsc') {
    return nameCompare || indexCompare || byId;
  }
  if (sortMode === 'nameDesc') {
    return -nameCompare || indexCompare || byId;
  }
  if (sortMode === 'statusAsc') {
    return statusCompare || dueCompare || startCompare || indexCompare || byId;
  }
  if (sortMode === 'statusDesc') {
    return -statusCompare || dueCompare || startCompare || indexCompare || byId;
  }
  return dueCompare || startCompare || indexCompare || byId;
}

function parseDateFromLooseText(text) {
  const raw = String(text || '');
  const match = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseChecklistTaskLine(line, relativePath, lineNumber) {
  const match = String(line || '').match(/^\s*[-*+]\s\[( |x|X)\]\s+(.+)$/);
  if (!match) {
    return null;
  }

  const isDone = match[1].toLowerCase() === 'x';
  const text = match[2].trim();
  if (!/#task(?:\b|\/)/i.test(text)) {
    return null;
  }

  const due = parseDateFromLooseText(text);
  const tagsFromLine = normalizeTags((text.match(/#[^\s#,]+/g) || []).map((tag) => tag.replace(/^#/, '')));
  const withoutTag = text.replace(/#task(?:\b|\/[^\s#]*)/ig, ' ').replace(/\s+/g, ' ').trim();
  const normalizedName = due ? withoutTag.replace(due, ' ').replace(/\s+/g, ' ').trim() : withoutTag;
  const safeName = normalizedName || `Task from ${getPathBaseName(relativePath) || 'note'}`;
  const today = toDateKey(new Date());
  const start = due || today;
  const end = due || toDateKey(addDays(today, 2));

  return {
    id: null,
    name: safeName,
    start,
    end,
    progress: isDone ? 100 : 0,
    status: isDone ? 'done' : 'todo',
    uid: '',
    parentId: null,
    dependsOn: [],
    tags: tagsFromLine,
    sourcePath: `${String(relativePath || '')}#L${lineNumber}`,
    markdown: `- [${isDone ? 'x' : ' '}] ${text}`
  };
}

function parseChecklistTasksFromMarkdown(content, relativePath) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const tasks = [];
  lines.forEach((line, index) => {
    const parsed = parseChecklistTaskLine(line, relativePath, index + 1);
    if (parsed) {
      tasks.push(parsed);
    }
  });
  return tasks;
}

function parseTaskFromMarkdownNote(content, relativePath, statusOptions = DEFAULT_STATUS_OPTIONS) {
  const { frontmatter, body } = splitFrontmatter(content);
  const meta = parseFrontmatterBlock(frontmatter);
  const fallbackName = String(relativePath || 'Imported Note').split('/').pop().replace(/\.md$/i, '') || 'Imported Note';
  const trimmedBody = String(body || '').trim();
  const firstHeading = trimmedBody.match(/^#\s+(.+)$/m);
  const name = typeof meta.name === 'string' && meta.name.trim()
    ? meta.name.trim()
    : (firstHeading ? firstHeading[1].trim() : fallbackName);

  let markdown = trimmedBody;
  const firstLineHeading = markdown.match(/^#\s+(.+)\n?/);
  if (firstLineHeading && firstLineHeading[1].trim() === name) {
    markdown = markdown.slice(firstLineHeading[0].length).replace(/^\n+/, '');
  }

  const parsedId = Number(meta.id);
  const id = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const rawIndex = meta.index ?? meta.taskIndex ?? meta.no;
  const index = rawIndex == null ? id : normalizeTaskIndex(rawIndex, id);
  const start = typeof meta.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.start) ? meta.start : toDateKey(new Date());
  const end = typeof meta.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.end) ? meta.end : toDateKey(addDays(start, 2));
  const progress = clamp(Number(meta.progress) || 0, 0, 100);
  const status = normalizeStatus(meta.status, progress, statusOptions);
  const uid = normalizeUid(meta.uid);
  const parentRaw = Number(meta.parentId);
  const parentId = Number.isInteger(parentRaw) && parentRaw > 0 && parentRaw !== id ? parentRaw : null;
  const dependsOn = parseDependsMeta(meta.dependsOn, id);
  const tags = normalizeTags(meta.tags);

  return {
    id,
    index,
    name,
    start,
    end,
    progress,
    status,
    uid,
    parentId,
    dependsOn,
    tags,
    sourcePath: String(relativePath || ''),
    markdown
  };
}

function parseTasksFromMarkdown(content, relativePath, statusOptions = DEFAULT_STATUS_OPTIONS) {
  const { frontmatter } = splitFrontmatter(content);
  const meta = parseFrontmatterBlock(frontmatter);
  const isTaskkanriNote = Boolean(meta.taskkanri) || meta.id != null || meta.start != null || meta.end != null;
  if (isTaskkanriNote) {
    return [parseTaskFromMarkdownNote(content, relativePath, statusOptions)];
  }

  const checklistTasks = parseChecklistTasksFromMarkdown(content, relativePath);
  return checklistTasks;
}

function selectMarkdownFileFromBrowser() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,text/markdown,text/plain';
    input.style.display = 'none';

    const cleanup = () => {
      input.remove();
    };

    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) {
        cleanup();
        resolve({ canceled: true, relativePath: null, content: '' });
        return;
      }

      try {
        const raw = await file.arrayBuffer();
        let content = '';
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        try {
          content = utf8Decoder.decode(raw);
        } catch {
          try {
            content = new TextDecoder('shift_jis', { fatal: true }).decode(raw);
          } catch {
            content = new TextDecoder('utf-8').decode(raw);
          }
        }
        resolve({
          canceled: false,
          relativePath: file.name || 'Selected.md',
          content
        });
      } catch {
        resolve({ canceled: true, relativePath: null, content: '' });
      } finally {
        cleanup();
      }
    };

    document.body.appendChild(input);
    input.click();
  });
}

function App() {
  const [tasks, setTasks] = useState(() => loadInitialTasks());
  const [leftWidth, setLeftWidth] = useState(() => loadInitialSplitWidth());
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= 980);
  const [modalTaskId, setModalTaskId] = useState(null);
  const [vaultPath, setVaultPath] = useState(() => localStorage.getItem(VAULT_PATH_KEY) || '');
  const [vaultStatus, setVaultStatus] = useState('');
  const [vaultLog, setVaultLog] = useState([]);
  const [isVaultBusy, setIsVaultBusy] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDueOpen, setIsDueOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openSettingsSections, setOpenSettingsSections] = useState(DEFAULT_SETTINGS_SECTIONS);
  const [settings, setSettings] = useState(() => loadInitialSettings());
  const [settingsDraft, setSettingsDraft] = useState(() => {
    const initial = loadInitialSettings();
    return {
      ...initial,
      shortcutsJson: JSON.stringify(initial.markdownShortcuts, null, 2)
    };
  });
  const [settingsError, setSettingsError] = useState('');
  const [showLightning, setShowLightning] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [sortMode, setSortMode] = useState(() => normalizeSortMode(localStorage.getItem(SORT_KEY)));
  const [tagColors, setTagColors] = useState(() => loadInitialTagColors());
  const [tagRenameDrafts, setTagRenameDrafts] = useState({});
  const [collapsedTags, setCollapsedTags] = useState({});
  const [filters, setFilters] = useState({
    status: 'all',
    dueBy: '',
    tag: 'all',
    quick: 'all',
    query: ''
  });

  const idRef = useRef(tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1);
  const headerScrollRef = useRef(null);
  const listScrollRef = useRef(null);
  const chartScrollRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const splitLayoutRef = useRef(null);
  const syncLockRef = useRef(false);
  const centeredTodayKeyRef = useRef('');
  const dragRef = useRef(null);
  const splitDragRef = useRef(null);
  const menuRef = useRef(null);
  const statusTimerRef = useRef(null);
  const autoSyncTimerRef = useRef(null);
  const searchPopupRef = useRef(null);
  const searchInputRef = useRef(null);
  const duePopupRef = useRef(null);
  const dueInputRef = useRef(null);
  const historyRef = useRef([]);
  const redoRef = useRef([]);

  const getDesktopApi = () => {
    const api = window.desktopApi;
    if (
      api
      && typeof api.selectVaultFolder === 'function'
      && typeof api.listMarkdownFiles === 'function'
      && typeof api.writeMarkdownFiles === 'function'
    ) {
      return api;
    }
    return null;
  };

  const setTasksWithHistory = (updater) => {
    setTasks((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) {
        return prev;
      }
      historyRef.current = [...historyRef.current.slice(-49), prev];
      redoRef.current = [];
      return next;
    });
  };

  const undoTasks = () => {
    const previous = historyRef.current.pop();
    if (!previous) {
      showVaultStatus('Nothing to undo.');
      return;
    }
    setTasks((current) => {
      redoRef.current = [...redoRef.current.slice(-49), current];
      return previous;
    });
    idRef.current = previous.reduce((max, task) => Math.max(max, task.id), 0) + 1;
    showVaultStatus('Undo applied.');
  };

  const redoTasks = () => {
    const next = redoRef.current.pop();
    if (!next) {
      showVaultStatus('Nothing to redo.');
      return;
    }
    setTasks((current) => {
      historyRef.current = [...historyRef.current.slice(-49), current];
      return next;
    });
    idRef.current = next.reduce((max, task) => Math.max(max, task.id), 0) + 1;
    showVaultStatus('Redo applied.');
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem(SPLIT_KEY, String(Math.round(leftWidth)));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem(VAULT_PATH_KEY, vaultPath);
  }, [vaultPath]);

  useEffect(() => {
    localStorage.setItem(TAG_COLORS_KEY, JSON.stringify(tagColors));
  }, [tagColors]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const normalizedSortMode = normalizeSortMode(sortMode);
    if (normalizedSortMode !== sortMode) {
      setSortMode(normalizedSortMode);
      return;
    }
    localStorage.setItem(SORT_KEY, normalizedSortMode);
  }, [sortMode]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const nextIndex = getNextTaskIndex(tasks);
    if (settings.nextTaskIndex < nextIndex) {
      setSettings((prev) => normalizeSettings({ ...prev, nextTaskIndex: nextIndex }));
    }
  }, [settings.nextTaskIndex, tasks]);

  useEffect(() => () => {
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    if (autoSyncTimerRef.current) {
      window.clearTimeout(autoSyncTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const onResize = () => {
      const compact = window.innerWidth <= 980;
      setIsCompact(compact);

      if (!compact && splitLayoutRef.current) {
        const containerWidth = splitLayoutRef.current.getBoundingClientRect().width;
        setLeftWidth((prev) => clampLeftWidth(prev, containerWidth));
      }
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!tasks.some((task) => task.id === modalTaskId)) {
      setModalTaskId(null);
    }
  }, [modalTaskId, tasks]);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const onMouseDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isSearchOpen) {
      return undefined;
    }

    const onMouseDown = (event) => {
      if (searchPopupRef.current && !searchPopupRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isDueOpen) {
      return undefined;
    }

    const onMouseDown = (event) => {
      if (duePopupRef.current && !duePopupRef.current.contains(event.target)) {
        setIsDueOpen(false);
      }
    };

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setIsDueOpen(false);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [isDueOpen]);

  useEffect(() => {
    if (!modalTaskId) {
      return undefined;
    }

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setModalTaskId(null);
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [modalTaskId]);

  const today = toDateKey(new Date());

  const timeline = useMemo(() => {
    if (tasks.length === 0) {
      const todayDate = parseDateKey(today);
      const start = addDays(todayDate, -14);
      const end = addDays(todayDate, 21);
      const days = daysBetween(start, end) + 1;
      return {
        start: toDateKey(start),
        days,
        width: days * COL_WIDTH
      };
    }

    const starts = tasks.map((task) => parseDateKey(task.start).getTime());
    const ends = tasks.map((task) => parseDateKey(task.end).getTime());
    const todayMs = parseDateKey(today).getTime();
    const first = new Date(Math.min(...starts, todayMs));
    const last = new Date(Math.max(...ends, todayMs));
    const start = addDays(first, -6);
    const end = addDays(last, 12);
    const days = daysBetween(start, end) + 1;

    return {
      start: toDateKey(start),
      days,
      width: days * COL_WIDTH
    };
  }, [tasks, today]);

  const monthSegments = useMemo(() => {
    const segments = [];
    let index = 0;
    while (index < timeline.days) {
      const date = addDays(timeline.start, index);
      const year = date.getFullYear();
      const month = date.getMonth();
      let days = 1;
      while (index + days < timeline.days) {
        const nextDate = addDays(timeline.start, index + days);
        if (nextDate.getFullYear() !== year || nextDate.getMonth() !== month) {
          break;
        }
        days += 1;
      }

      segments.push({
        key: `${year}-${month + 1}`,
        label: `${year}/${String(month + 1).padStart(2, '0')}`,
        width: days * COL_WIDTH
      });
      index += days;
    }

    return segments;
  }, [timeline.days, timeline.start]);

  const statusOptions = useMemo(() => normalizeStatusOptions(settings.statusOptions), [settings.statusOptions]);
  const statusColorMap = useMemo(() => buildStatusColorMap(statusOptions), [statusOptions]);
  const statusFilterOptions = useMemo(() => ([
    { value: 'all', label: 'All' },
    { value: 'open', label: '完了以外' },
    ...statusOptions
  ]), [statusOptions]);

  const orderedTasks = useMemo(() => (
    [...tasks].sort((a, b) => compareTasksBySortMode(a, b, normalizeSortMode(sortMode), statusOptions))
  ), [sortMode, statusOptions, tasks]);

  const tagPaths = useMemo(() => {
    const paths = new Set();
    orderedTasks.forEach((task) => {
      const primaryPath = getPrimaryTagPath(task);
      if (primaryPath === UNTAGGED_KEY) {
        paths.add(UNTAGGED_KEY);
        return;
      }

      const parts = primaryPath.split('/').filter(Boolean);
      let current = '';
      parts.forEach((part) => {
        current = current ? `${current}/${part}` : part;
        paths.add(current);
      });
    });
    return [...paths].sort(compareTagPath);
  }, [orderedTasks]);

  const todayOffset = daysBetween(timeline.start, today);
  const todayColumnLeft = todayOffset * COL_WIDTH;
  const hasTodayInTimeline = todayOffset >= 0 && todayOffset < timeline.days;

  useEffect(() => {
    setCollapsedTags((prev) => {
      const next = { ...prev };
      let changed = false;
      tagPaths.forEach((tagPath) => {
        if (!(tagPath in next)) {
          next[tagPath] = false;
          changed = true;
        }
      });
      Object.keys(next).forEach((tagPath) => {
        if (!tagPaths.includes(tagPath)) {
          delete next[tagPath];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tagPaths]);

  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      let changed = false;
      if (next.tag !== 'all' && !tagPaths.includes(next.tag)) {
        next.tag = 'all';
        changed = true;
      }
      const statusValues = new Set(['all', 'open', ...statusOptions.map((option) => option.value)]);
      if (!statusValues.has(next.status)) {
        next.status = 'all';
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [statusOptions, tagPaths]);

  const filteredTasks = useMemo(() => (
    orderedTasks.filter((task) => {
      const status = normalizeStatus(task.status, task.progress, statusOptions);
      if (filters.status === 'open' && status === 'done') {
        return false;
      }
      if (filters.status !== 'all' && filters.status !== 'open' && status !== filters.status) {
        return false;
      }
      const primaryTag = getPrimaryTagPath(task);
      if (!isTagPathMatch(primaryTag, filters.tag)) {
        return false;
      }
      if (filters.dueBy && task.end > filters.dueBy) {
        return false;
      }
      if (!isTaskInQuickFilter(task, filters.quick, today, statusOptions)) {
        return false;
      }
      if (!taskMatchesSearch(task, filters.query)) {
        return false;
      }
      return true;
    })
  ), [filters, orderedTasks, statusOptions, today]);

  const visibleRows = useMemo(() => {
    const nodeMap = new Map();
    const rootPaths = new Set();

    const ensureNode = (path) => {
      if (!nodeMap.has(path)) {
        nodeMap.set(path, {
          path,
          tasks: [],
          children: new Set()
        });
      }
      return nodeMap.get(path);
    };

    filteredTasks.forEach((task) => {
      const primaryPath = getPrimaryTagPath(task);
      if (primaryPath === UNTAGGED_KEY) {
        ensureNode(UNTAGGED_KEY).tasks.push(task);
        rootPaths.add(UNTAGGED_KEY);
        return;
      }

      const parts = primaryPath.split('/').filter(Boolean);
      let parentPath = '';
      parts.forEach((part, index) => {
        const currentPath = parentPath ? `${parentPath}/${part}` : part;
        ensureNode(currentPath);
        if (index === 0) {
          rootPaths.add(currentPath);
        }
        if (parentPath) {
          ensureNode(parentPath).children.add(currentPath);
        }
        parentPath = currentPath;
      });

      ensureNode(primaryPath).tasks.push(task);
    });

    const statusCountsFor = (tasksForPath) => tasksForPath.reduce((counts, task) => {
      const status = normalizeStatus(task.status, task.progress, statusOptions);
      return {
        ...counts,
        [status]: (counts[status] || 0) + 1
      };
    }, Object.fromEntries(statusOptions.map((option) => [option.value, 0])));

    const collectTasksForPath = (path) => {
      const node = nodeMap.get(path);
      if (!node) {
        return [];
      }

      return [
        ...node.tasks,
        ...[...node.children].flatMap((childPath) => collectTasksForPath(childPath))
      ];
    };

    const aggregateTasksForPath = (path) => {
      const tasksForPath = collectTasksForPath(path);
      if (tasksForPath.length === 0) {
        return null;
      }

      const start = tasksForPath.reduce((min, task) => (
        parseDateKey(task.start) < parseDateKey(min) ? task.start : min
      ), tasksForPath[0].start);
      const end = tasksForPath.reduce((max, task) => (
        parseDateKey(task.end) > parseDateKey(max) ? task.end : max
      ), tasksForPath[0].end);
      const weighted = tasksForPath.reduce((total, task) => {
        const duration = Math.max(1, daysBetween(task.start, task.end) + 1);
        return {
          progress: total.progress + (task.progress * duration),
          duration: total.duration + duration
        };
      }, { progress: 0, duration: 0 });
      const progress = weighted.duration > 0
        ? Math.round(weighted.progress / weighted.duration)
        : 0;
      const statuses = tasksForPath.map((task) => normalizeStatus(task.status, task.progress, statusOptions));
      const status = statuses.every((item) => item === 'done')
        ? 'done'
        : (statuses.some((item) => item === 'doing') || progress > 0 ? 'doing' : 'todo');

      return {
        start,
        end,
        progress,
        status,
        count: tasksForPath.length
      };
    };

    const rows = [];

    const walk = (path) => {
      const node = nodeMap.get(path);
      if (!node) {
        return;
      }

      const palette = getTagPalette(path, tagColors);
      const collapsed = Boolean(collapsedTags[path]);
      rows.push({
        type: 'group',
        group: path,
        label: tagGroupLabel(path),
        level: tagDepth(path),
        palette,
        statusCounts: statusCountsFor(node.tasks),
        aggregate: collapsed ? aggregateTasksForPath(path) : null,
        collapsed
      });

      if (!collapsed) {
        node.tasks.forEach((task) => {
          rows.push({
            type: 'task',
            task,
            group: path,
            level: tagDepth(path),
            palette
          });
        });
        [...node.children]
          .sort(compareTagPath)
          .forEach((childPath) => walk(childPath));
      }
    };

    [...rootPaths]
      .sort(compareTagPath)
      .forEach((path) => walk(path));

    return rows;
  }, [collapsedTags, filteredTasks, statusOptions, tagColors]);

  const rowMetrics = useMemo(() => {
    const metrics = [];
    const taskMetricById = new Map();
    const groupMetricByPath = new Map();
    let top = 0;

    visibleRows.forEach((row) => {
      const height = row.type === 'group' ? GROUP_ROW_HEIGHT : TASK_ROW_HEIGHT;
      const metric = {
        top,
        height,
        centerY: top + (height / 2)
      };
      metrics.push(metric);
      if (row.type === 'task') {
        taskMetricById.set(row.task.id, metric);
      } else {
        groupMetricByPath.set(row.group, metric);
      }
      top += height;
    });

    return {
      metrics,
      taskMetricById,
      groupMetricByPath,
      totalHeight: Math.max(top, TASK_ROW_HEIGHT * 2)
    };
  }, [visibleRows]);

  const visibleTasks = useMemo(() => (
    visibleRows.filter((row) => row.type === 'task').map((row) => row.task)
  ), [visibleRows]);

  const chartHeight = rowMetrics.totalHeight;

  const geometry = useMemo(() => {
    const positions = new Map();
    const positionFor = (metric, start, end, barHeight = BAR_HEIGHT) => {
      if (!metric) {
        return null;
      }
      const startOffset = daysBetween(timeline.start, start);
      const duration = Math.max(1, daysBetween(start, end) + 1);
      const startX = startOffset * COL_WIDTH + 3;
      const width = Math.max(12, duration * COL_WIDTH - 6);
      const endX = startX + width;
      return {
        startX,
        endX,
        centerY: metric.centerY,
        width,
        top: metric.top + ((metric.height - barHeight) / 2)
      };
    };

    visibleTasks.forEach((task) => {
      const position = positionFor(rowMetrics.taskMetricById.get(task.id), task.start, task.end);
      if (position) {
        positions.set(task.id, position);
      }
    });

    visibleRows.forEach((row) => {
      if (row.type !== 'group' || !row.aggregate) {
        return;
      }
      const position = positionFor(
        rowMetrics.groupMetricByPath.get(row.group),
        row.aggregate.start,
        row.aggregate.end,
        AGGREGATE_BAR_HEIGHT
      );
      if (position) {
        positions.set(`group:${row.group}`, position);
      }
    });
    return positions;
  }, [rowMetrics, timeline.start, visibleRows, visibleTasks]);

  useEffect(() => {
    const chartNode = chartScrollRef.current;
    const listNode = listScrollRef.current;
    const headerNode = headerScrollRef.current;

    if (!chartNode || !listNode || !headerNode) {
      return undefined;
    }

    const syncFromChart = () => {
      if (syncLockRef.current) {
        return;
      }
      syncLockRef.current = true;
      listNode.scrollTop = chartNode.scrollTop;
      headerNode.scrollLeft = chartNode.scrollLeft;
      requestAnimationFrame(() => {
        syncLockRef.current = false;
      });
    };

    const syncFromList = () => {
      if (syncLockRef.current) {
        return;
      }
      syncLockRef.current = true;
      chartNode.scrollTop = listNode.scrollTop;
      requestAnimationFrame(() => {
        syncLockRef.current = false;
      });
    };

    chartNode.addEventListener('scroll', syncFromChart);
    listNode.addEventListener('scroll', syncFromList);

    return () => {
      chartNode.removeEventListener('scroll', syncFromChart);
      listNode.removeEventListener('scroll', syncFromList);
    };
  }, []);

  useEffect(() => {
    if (!hasTodayInTimeline) {
      return undefined;
    }

    const centerKey = `${today}-${timeline.start}-${timeline.days}-${isCompact ? 'compact' : 'desktop'}`;
    if (centeredTodayKeyRef.current === centerKey) {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const chartNode = chartScrollRef.current;
      const headerNode = headerScrollRef.current;
      if (!chartNode || !headerNode) {
        return;
      }

      const todayCenter = todayColumnLeft + (COL_WIDTH / 2);
      const maxScroll = Math.max(0, chartNode.scrollWidth - chartNode.clientWidth);
      const targetScroll = clamp(todayCenter - (chartNode.clientWidth / 2), 0, maxScroll);
      syncLockRef.current = true;
      chartNode.scrollLeft = targetScroll;
      headerNode.scrollLeft = targetScroll;
      centeredTodayKeyRef.current = centerKey;
      window.requestAnimationFrame(() => {
        syncLockRef.current = false;
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [hasTodayInTimeline, isCompact, timeline.days, timeline.start, today, todayColumnLeft]);

  const updateTask = (taskId, updater) => {
    setTasksWithHistory((prev) => prev.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      const patch = typeof updater === 'function' ? updater(task) : updater;
      const next = { ...task, ...(patch || {}) };
      const safeStart = next.start;
      const safeEnd = parseDateKey(next.end) < parseDateKey(next.start) ? next.start : next.end;
      const safeIndex = normalizeTaskIndex(next.index, task.index || task.id);
      const requestedStatus = normalizeStatus(next.status, next.progress, statusOptions);
      const statusChanged = Boolean(patch) && Object.prototype.hasOwnProperty.call(patch, 'status');
      const nextProgress = statusChanged
        ? statusProgressValue(requestedStatus, next.progress)
        : clamp(Number(next.progress) || 0, 0, 100);
      const progressWithStatus = requestedStatus === 'done' ? 100 : nextProgress;
      return {
        ...task,
        ...next,
        index: safeIndex,
        start: safeStart,
        end: safeEnd,
        progress: progressWithStatus,
        status: normalizeStatus(next.status, progressWithStatus, statusOptions)
      };
    }));
  };

  const getConfiguredNextTaskIndex = () => Math.max(
    normalizeTaskIndex(settings.nextTaskIndex, getNextTaskIndex(tasks)),
    getNextTaskIndex(tasks)
  );

  const advanceNextTaskIndex = (usedIndex) => {
    setSettings((prev) => normalizeSettings({
      ...prev,
      nextTaskIndex: Math.max(normalizeTaskIndex(prev.nextTaskIndex, usedIndex + 1), usedIndex + 1)
    }));
  };

  const removeTask = (taskId) => {
    setTasksWithHistory((prev) => prev
      .filter((task) => task.id !== taskId)
      .map((task) => ({
        ...task,
        parentId: task.parentId === taskId ? null : task.parentId,
        dependsOn: task.dependsOn.filter((id) => id !== taskId)
      }))
    );
  };

  const addTaskAt = (taskBase, index = tasks.length) => {
    const id = idRef.current;
    idRef.current += 1;

    const normalized = normalizeTask({
      ...taskBase,
      index: taskBase.index ?? getConfiguredNextTaskIndex(),
      id
    }, id, statusOptions);

    setTasksWithHistory((prev) => {
      const next = [...prev];
      const safeIndex = clamp(index, 0, next.length);
      next.splice(safeIndex, 0, normalized);
      return next;
    });
  };

  const handleTaskAddClick = () => {
    const id = idRef.current;
    const nextIndex = getConfiguredNextTaskIndex();
    const uid = createUid();
    const start = toDateKey(new Date());
    const end = toDateKey(addDays(start, 2));
    const statusValues = new Set(statusOptions.map((option) => option.value));
    const initialStatus = statusValues.has(filters.status)
      ? filters.status
      : 'todo';
    const initialTags = filters.tag === 'all' || filters.tag === UNTAGGED_KEY
      ? []
      : [filters.tag];

    addTaskAt({
      name: `Task ${nextIndex}`,
      index: nextIndex,
      uid,
      status: initialStatus,
      start,
      end,
      progress: statusProgressValue(initialStatus, 0),
      parentId: null,
      dependsOn: [],
      tags: initialTags,
      markdown: ''
    });

    setModalTaskId(id);
    advanceNextTaskIndex(nextIndex);
  };

  const addTaskForTag = (tagPath) => {
    const normalizedTag = normalizeTagPath(tagPath);
    const id = idRef.current;
    const nextIndex = getConfiguredNextTaskIndex();
    const start = toDateKey(new Date());
    const end = toDateKey(addDays(start, 2));
    const tags = normalizedTag === UNTAGGED_KEY ? [] : [normalizedTag];

    addTaskAt({
      name: `Task ${nextIndex}`,
      index: nextIndex,
      uid: createUid(),
      status: 'todo',
      start,
      end,
      progress: 0,
      parentId: null,
      dependsOn: [],
      tags,
      markdown: ''
    });

    setCollapsedTags((prev) => ({
      ...prev,
      [normalizedTag]: false
    }));
    setModalTaskId(id);
    advanceNextTaskIndex(nextIndex);
    showVaultStatus(`Added task to ${tagLabel(normalizedTag)}.`);
  };

  const handleTagRowContextMenu = (event, tagPath) => {
    if (event.target.closest('button, input, select, textarea')) {
      return;
    }
    event.preventDefault();
    addTaskForTag(tagPath);
  };

  const toggleGroupCollapsed = (group) => {
    setCollapsedTags((prev) => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  const renameTagPath = (oldPath, rawNewPath) => {
    const normalizedOld = normalizeTagPath(oldPath);
    const normalizedNew = normalizeTagPath(rawNewPath);
    if (!normalizedOld || normalizedOld === UNTAGGED_KEY || normalizedNew === UNTAGGED_KEY || normalizedOld === normalizedNew) {
      setTagRenameDrafts((prev) => ({ ...prev, [oldPath]: tagLabel(oldPath) }));
      return;
    }

    const replaceTag = (tag) => {
      const normalized = normalizeTagPath(tag);
      if (normalized === normalizedOld) {
        return normalizedNew;
      }
      if (normalized.startsWith(`${normalizedOld}/`)) {
        return `${normalizedNew}${normalized.slice(normalizedOld.length)}`;
      }
      return normalized;
    };

    setTasksWithHistory((prev) => prev.map((task) => ({
      ...task,
      tags: [...new Set(normalizeTags(task.tags).map(replaceTag))]
    })));
    setTagColors((prev) => {
      const next = { ...prev };
      Object.entries(prev).forEach(([path, color]) => {
        const normalizedPath = normalizeTagPath(path);
        if (normalizedPath === normalizedOld || normalizedPath.startsWith(`${normalizedOld}/`)) {
          const movedPath = normalizedPath === normalizedOld
            ? normalizedNew
            : `${normalizedNew}${normalizedPath.slice(normalizedOld.length)}`;
          next[movedPath] = color;
          delete next[path];
        }
      });
      return next;
    });
    setCollapsedTags((prev) => {
      const next = { ...prev };
      Object.entries(prev).forEach(([path, collapsed]) => {
        const normalizedPath = normalizeTagPath(path);
        if (normalizedPath === normalizedOld || normalizedPath.startsWith(`${normalizedOld}/`)) {
          const movedPath = normalizedPath === normalizedOld
            ? normalizedNew
            : `${normalizedNew}${normalizedPath.slice(normalizedOld.length)}`;
          next[movedPath] = collapsed;
          delete next[path];
        }
      });
      return next;
    });
    setTagRenameDrafts((prev) => {
      const next = { ...prev };
      delete next[oldPath];
      return next;
    });
    showVaultStatus(`Tag renamed: ${tagLabel(normalizedOld)} -> ${tagLabel(normalizedNew)}`);
  };

  const deleteTagPath = (tagPath) => {
    const normalizedTarget = normalizeTagPath(tagPath);
    if (normalizedTarget === UNTAGGED_KEY) {
      return;
    }
    const ok = window.confirm(`Remove ${tagLabel(normalizedTarget)} from matching tasks?`);
    if (!ok) {
      return;
    }
    setTasksWithHistory((prev) => prev.map((task) => ({
      ...task,
      tags: normalizeTags(task.tags).filter((tag) => {
        const normalized = normalizeTagPath(tag);
        return normalized !== normalizedTarget && !normalized.startsWith(`${normalizedTarget}/`);
      })
    })));
    setTagColors((prev) => Object.fromEntries(
      Object.entries(prev).filter(([path]) => {
        const normalized = normalizeTagPath(path);
        return normalized !== normalizedTarget && !normalized.startsWith(`${normalizedTarget}/`);
      })
    ));
    showVaultStatus(`Tag removed: ${tagLabel(normalizedTarget)}`);
  };

  const duplicateTask = (taskId) => {
    const original = tasks.find((task) => task.id === taskId);
    if (!original) {
      return;
    }
    const nextIndex = getConfiguredNextTaskIndex();
    const insertionIndex = tasks.findIndex((task) => task.id === taskId) + 1;
    const id = idRef.current;
    addTaskAt({
      ...original,
      name: `${original.name} Copy`,
      index: nextIndex,
      uid: createUid(),
      sourcePath: ''
    }, insertionIndex);
    setModalTaskId(id);
    advanceNextTaskIndex(nextIndex);
    showVaultStatus(`Duplicated Task #${getTaskIndex(original)}.`);
  };

  const handleDisconnectVault = () => {
    setVaultPath('');
    showVaultStatus('Vault disconnected.');
  };

  const handleClearAllTasks = () => {
    if (tasks.length === 0) {
      showVaultStatus('No tasks to clear.');
      return;
    }

    const ok = window.confirm('Delete all tasks? You can restore them with Undo until the app is closed.');
    if (!ok) {
      return;
    }

    setTasksWithHistory([]);
    setModalTaskId(null);
    idRef.current = 1;
    setSettings((prev) => normalizeSettings({ ...prev, nextTaskIndex: 1 }));
    showVaultStatus('All tasks deleted.');
  };

  const syncTasksToVault = async (targetVaultPath, targetTasks, options = {}) => {
    const api = getDesktopApi();
    if (!targetVaultPath || !api) {
      return { writtenCount: 0, deletedCount: 0 };
    }

    const files = buildTaskMarkdownFiles(targetTasks, settings);
    if (typeof api.syncMarkdownFiles === 'function') {
      return api.syncMarkdownFiles(targetVaultPath, files, {
        deleteStaleManaged: Boolean(options.deleteStaleManaged)
      });
    }
    const result = await api.writeMarkdownFiles(targetVaultPath, files);
    return { ...result, deletedCount: 0 };
  };

  const replaceTasksWithImportedRecords = (records) => {
    if (!Array.isArray(records) || records.length === 0) {
      return { importedCount: 0 };
    }

    let importedCount = 0;
    const next = [];
    const usedIds = new Set();
    let maxId = 0;

    records.forEach((parsed) => {
      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const incomingId = Number(parsed.id);
      let resolvedId = Number.isInteger(incomingId) && incomingId > 0 && !usedIds.has(incomingId)
        ? incomingId
        : null;
      if (!resolvedId) {
        resolvedId = maxId + 1;
        while (usedIds.has(resolvedId)) {
          resolvedId += 1;
        }
      }

      const normalized = normalizeTask({
        ...parsed,
        id: resolvedId
      }, resolvedId, statusOptions);
      next.push(normalized);
      usedIds.add(normalized.id);
      maxId = Math.max(maxId, normalized.id);
      importedCount += 1;
    });

    idRef.current = Math.max(maxId + 1, 1);
    setTasksWithHistory(next);
    return { importedCount };
  };

  const loadTasksFromVaultPath = async (targetVaultPath) => {
    const api = getDesktopApi();
    if (!api) {
      showVaultStatus('Vault API is unavailable.');
      return { importedCount: 0 };
    }

    const result = await api.listMarkdownFiles({ vaultPath: targetVaultPath });
    const files = Array.isArray(result.files) ? result.files : [];
    const parsedRecords = files.flatMap((file) => {
      if (!file || typeof file.relativePath !== 'string' || typeof file.content !== 'string') {
        return [];
      }
      return parseTasksFromMarkdown(file.content, file.relativePath, statusOptions);
    });

    if (parsedRecords.length === 0) {
      return { importedCount: 0 };
    }

    return replaceTasksWithImportedRecords(parsedRecords);
  };

  const appendVaultLog = (message, targetVaultPath = vaultPath) => {
    const createdAt = new Date();
    const timestamp = new Date().toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setVaultLog((prev) => [{ timestamp, message }, ...prev].slice(0, 10));

    const api = getDesktopApi();
    if (targetVaultPath && api && typeof api.appendVaultLog === 'function') {
      api.appendVaultLog(targetVaultPath, `[${createdAt.toISOString()}] ${message}`).catch((error) => {
        if (api && typeof api.logRenderer === 'function') {
          api.logRenderer('warn', `vault log write failed: ${error.message}`);
        }
      });
    }
  };

  const showVaultStatus = (message, targetVaultPath = vaultPath) => {
    setVaultStatus(message);
    appendVaultLog(message, targetVaultPath);
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setVaultStatus('');
      statusTimerRef.current = null;
    }, 5000);
  };

  const handleSelectVault = async () => {
    const api = getDesktopApi();
    if (!api) {
      showVaultStatus('Vault API is unavailable.');
      return;
    }

    try {
      const result = await api.selectVaultFolder();
      if (result && !result.canceled && result.path) {
        setIsVaultBusy(true);
        setVaultPath(result.path);
        const { importedCount } = await loadTasksFromVaultPath(result.path);
        const vaultName = getPathBaseName(result.path);
        if (importedCount > 0) {
          showVaultStatus(`Vault selected: ${vaultName}. Loaded ${importedCount} tasks.`, result.path);
        } else {
          showVaultStatus(`Vault selected: ${vaultName}. No task markdown found.`, result.path);
        }
      }
    } catch (error) {
      showVaultStatus(`Failed to select vault: ${error.message}`);
    } finally {
      setIsVaultBusy(false);
    }
  };

  const mergeImportedTasks = (records) => {
    if (!Array.isArray(records) || records.length === 0) {
      return { importedCount: 0, updatedCount: 0 };
    }

    let importedCount = 0;
    let updatedCount = 0;

    setTasksWithHistory((prev) => {
      const next = [...prev];
      const idToIndex = new Map(next.map((task, index) => [task.id, index]));
      const pathToIndex = new Map(
        next
          .map((task, index) => [task.sourcePath, index])
          .filter((entry) => entry[0])
      );
      let maxId = next.reduce((max, task) => Math.max(max, task.id), 0);

      records.forEach((parsed) => {
        if (!parsed || typeof parsed !== 'object') {
          return;
        }

        const incomingId = Number(parsed.id);
        if (parsed.sourcePath && pathToIndex.has(parsed.sourcePath)) {
          const index = pathToIndex.get(parsed.sourcePath);
          const current = next[index];
          const preservedId = current.id;
          const merged = normalizeTask({
            ...current,
            ...parsed,
            id: preservedId
          }, preservedId, statusOptions);
          next[index] = merged;
          idToIndex.set(preservedId, index);
          updatedCount += 1;
          return;
        }

        if (Number.isInteger(incomingId) && incomingId > 0 && idToIndex.has(incomingId)) {
          const index = idToIndex.get(incomingId);
          const merged = normalizeTask({
            ...next[index],
            ...parsed,
            id: incomingId
          }, incomingId, statusOptions);
          next[index] = merged;
          if (merged.sourcePath) {
            pathToIndex.set(merged.sourcePath, index);
          }
          updatedCount += 1;
          return;
        }

        const resolvedId = Number.isInteger(incomingId) && incomingId > 0 && !idToIndex.has(incomingId)
          ? incomingId
          : (maxId + 1);
        maxId = Math.max(maxId, resolvedId);
        const normalized = normalizeTask({
          ...parsed,
          id: resolvedId
        }, resolvedId, statusOptions);
        next.push(normalized);
        idToIndex.set(resolvedId, next.length - 1);
        if (normalized.sourcePath) {
          pathToIndex.set(normalized.sourcePath, next.length - 1);
        }
        importedCount += 1;
      });

      idRef.current = Math.max(idRef.current, maxId + 1);
      return next;
    });

    return { importedCount, updatedCount };
  };

  const handleImportNotesFromVault = async () => {
    if (!vaultPath) {
      showVaultStatus('Select a vault first.');
      return;
    }
    const api = getDesktopApi();
    if (!api) {
      showVaultStatus('Vault API is unavailable.');
      return;
    }

    setIsVaultBusy(true);
    try {
      const result = await api.listMarkdownFiles({ vaultPath, tag: IMPORT_TAG });
      let files = Array.isArray(result.files) ? result.files : [];
      let parsedRecords = files.flatMap((file) => {
        if (!file || typeof file.relativePath !== 'string' || typeof file.content !== 'string') {
          return [];
        }
        return parseTasksFromMarkdown(file.content, file.relativePath, statusOptions);
      });

      if (parsedRecords.length === 0) {
        const fullScan = await api.listMarkdownFiles({ vaultPath });
        files = Array.isArray(fullScan.files) ? fullScan.files : [];
        parsedRecords = files.flatMap((file) => {
          if (!file || typeof file.relativePath !== 'string' || typeof file.content !== 'string') {
            return [];
          }
          return parseTasksFromMarkdown(file.content, file.relativePath, statusOptions);
        });
      }

      if (parsedRecords.length === 0) {
        showVaultStatus(`No ${IMPORT_TAG} task lines found in vault.`);
        return;
      }

      const { importedCount, updatedCount } = mergeImportedTasks(parsedRecords);
      showVaultStatus(`Imported ${importedCount} / Updated ${updatedCount} notes with ${IMPORT_TAG}.`);
    } catch (error) {
      showVaultStatus(`Import failed: ${error.message}`);
    } finally {
      setIsVaultBusy(false);
    }
  };

  const handleImportSingleFile = async () => {
    const api = getDesktopApi();

    setIsVaultBusy(true);
    try {
      const selected = (api && typeof api.selectMarkdownFile === 'function')
        ? await api.selectMarkdownFile(vaultPath || '')
        : await selectMarkdownFileFromBrowser();

      if (!selected || selected.canceled || !selected.content) {
        return;
      }

      const relativePath = selected.relativePath || getPathBaseName(selected.path) || 'Selected.md';
      const parsedRecords = parseTasksFromMarkdown(selected.content, relativePath, statusOptions);
      if (parsedRecords.length === 0) {
        showVaultStatus(`No ${IMPORT_TAG} task lines found in selected file.`);
        return;
      }

      const { importedCount, updatedCount } = mergeImportedTasks(parsedRecords);
      showVaultStatus(`Imported ${importedCount} / Updated ${updatedCount} tasks from one file.`);
    } catch (error) {
      showVaultStatus(`Import file failed: ${error.message}`);
    } finally {
      setIsVaultBusy(false);
    }
  };

  useEffect(() => {
    const api = getDesktopApi();
    if (!vaultPath || !api || isVaultBusy) {
      return undefined;
    }

    autoSyncTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await syncTasksToVault(vaultPath, tasks, { deleteStaleManaged: true });
        const deletedText = result.deletedCount ? ` / Deleted ${result.deletedCount}` : '';
        appendVaultLog(`Auto-saved ${result.writtenCount}${deletedText} tasks to ${getPathBaseName(vaultPath)}.`);
      } catch (error) {
        showVaultStatus(`Auto-save failed: ${error.message}`);
      } finally {
        autoSyncTimerRef.current = null;
      }
    }, 900);

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [tasks, vaultPath, isVaultBusy, settings]);

  const stopDrag = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', handleDragging);
    window.removeEventListener('mouseup', stopDrag);
  };

  const handleDragging = (event) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const diffPx = event.clientX - drag.startClientX;
    const diffDays = Math.round(diffPx / COL_WIDTH);

    if (diffDays === drag.lastDiffDays) {
      return;
    }

    drag.lastDiffDays = diffDays;

    setTasks((prev) => prev.map((task) => {
      if (task.id !== drag.taskId) {
        return task;
      }

      if (drag.mode === 'move') {
        return {
          ...task,
          start: toDateKey(addDays(drag.originStart, diffDays)),
          end: toDateKey(addDays(drag.originEnd, diffDays))
        };
      }

      if (drag.mode === 'resize-start') {
        const maybeStart = toDateKey(addDays(drag.originStart, diffDays));
        return {
          ...task,
          start: parseDateKey(maybeStart) > parseDateKey(task.end) ? task.end : maybeStart
        };
      }

      if (drag.mode === 'resize-end') {
        const maybeEnd = toDateKey(addDays(drag.originEnd, diffDays));
        return {
          ...task,
          end: parseDateKey(maybeEnd) < parseDateKey(task.start) ? task.start : maybeEnd
        };
      }

      return task;
    }));
  };

  const startDrag = (event, taskId, mode) => {
    event.preventDefault();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    dragRef.current = {
      taskId,
      mode,
      startClientX: event.clientX,
      originStart: task.start,
      originEnd: task.end,
      lastDiffDays: null
    };

    window.addEventListener('mousemove', handleDragging);
    window.addEventListener('mouseup', stopDrag);
  };

  const stopSplitDrag = () => {
    splitDragRef.current = null;
    document.body.classList.remove('split-dragging');
    window.removeEventListener('mousemove', handleSplitDragging);
    window.removeEventListener('mouseup', stopSplitDrag);
  };

  const handleSplitDragging = (event) => {
    const drag = splitDragRef.current;
    if (!drag || !splitLayoutRef.current) {
      return;
    }

    const containerWidth = splitLayoutRef.current.getBoundingClientRect().width;
    const nextWidth = clampLeftWidth(drag.startWidth + (event.clientX - drag.startX), containerWidth);
    setLeftWidth(nextWidth);
  };

  const startSplitDrag = (event) => {
    if (isCompact || !splitLayoutRef.current) {
      return;
    }

    event.preventDefault();
    const containerWidth = splitLayoutRef.current.getBoundingClientRect().width;
    splitDragRef.current = {
      startX: event.clientX,
      startWidth: leftWidth,
      containerWidth
    };

    document.body.classList.add('split-dragging');
    window.addEventListener('mousemove', handleSplitDragging);
    window.addEventListener('mouseup', stopSplitDrag);
  };

  useEffect(() => () => {
    window.removeEventListener('mousemove', handleDragging);
    window.removeEventListener('mouseup', stopDrag);
    window.removeEventListener('mousemove', handleSplitDragging);
    window.removeEventListener('mouseup', stopSplitDrag);
    document.body.classList.remove('split-dragging');
  }, []);

  const handleChartDoubleClick = (event) => {
    if (event.target.closest('.task-bar')) {
      return;
    }

    const canvas = chartCanvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dayOffset = clamp(Math.floor(x / COL_WIDTH), 0, timeline.days - 1);
    const row = findRowIndexAtOffset(y, rowMetrics.metrics);
    const uid = createUid();
    const start = toDateKey(addDays(timeline.start, dayOffset));
    const end = toDateKey(addDays(start, 2));
    const targetRow = visibleRows[row] || null;
    const fallbackTag = filters.tag !== 'all'
      ? filters.tag
      : (targetRow?.group || UNTAGGED_KEY);
    const fallbackTags = fallbackTag === UNTAGGED_KEY ? [] : [fallbackTag];
    const nextIndex = getConfiguredNextTaskIndex();

    addTaskAt({
      name: `Task ${nextIndex}`,
      index: nextIndex,
      uid,
      status: 'todo',
      start,
      end,
      progress: 0,
      parentId: null,
      dependsOn: [],
      tags: fallbackTags,
      markdown: ''
    });
    advanceNextTaskIndex(nextIndex);
  };

  const relationPaths = useMemo(() => {
    const dependencies = [];
    const parents = [];

    visibleTasks.forEach((task) => {
      const current = geometry.get(task.id);
      if (!current) {
        return;
      }

      task.dependsOn.forEach((fromId) => {
        const source = geometry.get(fromId);
        if (!source) {
          return;
        }

        const x1 = source.endX + 5;
        const y1 = source.centerY;
        const x2 = current.startX - 5;
        const y2 = current.centerY;
        const elbowX = x1 + Math.max(16, (x2 - x1) / 2);
        const tagBase = getTagPalette(getPrimaryTagPath(task), tagColors).baseHex;
        dependencies.push({
          path: `M${x1},${y1} L${elbowX},${y1} L${elbowX},${y2} L${x2},${y2}`,
          color: complementHex(tagBase)
        });
      });

      if (task.parentId) {
        const parent = geometry.get(task.parentId);
        if (parent) {
          const x = Math.min(parent.startX, current.startX) - 8;
          parents.push(`M${x},${parent.centerY} L${x},${current.centerY}`);
        }
      }
    });

    return { dependencies, parents };
  }, [geometry, tagColors, visibleTasks]);

  const lightningData = useMemo(() => {
    const taskPoints = new Map();
    const pointsByTag = new Map();

    visibleTasks.forEach((task) => {
      const position = geometry.get(task.id);
      if (!position) {
        return;
      }

      const point = {
        taskId: task.id,
        tagPath: getPrimaryTagPath(task),
        x: position.startX + ((position.endX - position.startX) * task.progress) / 100,
        y: position.centerY
      };
      taskPoints.set(task.id, point);
      if (!pointsByTag.has(point.tagPath)) {
        pointsByTag.set(point.tagPath, []);
      }
      pointsByTag.get(point.tagPath).push(point);
    });

    const tagPolylines = [...pointsByTag.entries()]
      .map(([tagPath, points]) => {
        if (points.length < 2) {
          return null;
        }
        const ordered = [...points].sort((a, b) => a.y - b.y);
        const palette = getTagPalette(tagPath, tagColors);
        return {
          tagPath,
          points: ordered,
          polyline: ordered.map((point) => `${point.x},${point.y}`).join(' '),
          color: palette.strong,
          dotColor: palette.baseHex
        };
      })
      .filter(Boolean);

    const crossTagLines = [];
    visibleTasks.forEach((task) => {
      const current = taskPoints.get(task.id);
      if (!current) {
        return;
      }
      task.dependsOn.forEach((fromId) => {
        const source = taskPoints.get(fromId);
        if (!source || source.tagPath === current.tagPath) {
          return;
        }
        crossTagLines.push({
          key: `${fromId}-${task.id}`,
          path: `M${source.x},${source.y} L${current.x},${current.y}`,
          color: complementHex(getTagPalette(current.tagPath, tagColors).baseHex)
        });
      });
    });

    return {
      tagPolylines,
      crossTagLines
    };
  }, [geometry, tagColors, visibleTasks]);

  const modalTask = tasks.find((task) => task.id === modalTaskId) || null;
  const modalMarkdownPath = modalTask ? getTaskMarkdownRelativePath(modalTask, settings) : '';
  const [modalTagDraft, setModalTagDraft] = useState('');
  const noteEditorRef = useRef(null);

  useEffect(() => {
    setModalTagDraft('');
  }, [modalTaskId]);

  const commitTagDraft = () => {
    if (!modalTask) {
      setModalTagDraft('');
      return;
    }

    const currentTags = normalizeTags(modalTask.tags);
    const nextTags = mergeModalTags(currentTags, modalTagDraft);
    if (nextTags.join('\n') === currentTags.join('\n')) {
      setModalTagDraft('');
      return;
    }

    updateTask(modalTask.id, {
      tags: nextTags
    });
    setModalTagDraft('');
  };

  const removeModalTag = (tagToRemove) => {
    if (!modalTask) {
      return;
    }
    updateTask(modalTask.id, {
      tags: normalizeTags(modalTask.tags).filter((tag) => tag !== tagToRemove)
    });
  };

  const commitModalDrafts = () => {
    commitTagDraft();
    if (noteEditorRef.current && typeof noteEditorRef.current.flush === 'function') {
      noteEditorRef.current.flush();
    }
  };

  const closeModal = () => {
    commitModalDrafts();
    setModalTaskId(null);
  };

  const openSettings = () => {
    setSettingsDraft({
      indexDigits: settings.indexDigits,
      nextTaskIndex: settings.nextTaskIndex,
      fileNamePattern: settings.fileNamePattern,
      statusOptions: settings.statusOptions,
      shortcutsJson: JSON.stringify(settings.markdownShortcuts, null, 2)
    });
    setSettingsError('');
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsError('');
    setIsSettingsOpen(false);
  };

  const saveSettings = () => {
    try {
      const markdownShortcuts = JSON.parse(settingsDraft.shortcutsJson || '{}');
      setSettings(normalizeSettings({
        indexDigits: settingsDraft.indexDigits,
        nextTaskIndex: settingsDraft.nextTaskIndex,
        fileNamePattern: settingsDraft.fileNamePattern,
        statusOptions: settingsDraft.statusOptions,
        markdownShortcuts
      }));
      closeSettings();
    } catch {
      setSettingsError('Markdown shortcuts JSON is invalid.');
    }
  };

  const resetShortcutDraft = () => {
    setSettingsDraft((prev) => ({
      ...prev,
      shortcutsJson: JSON.stringify(DEFAULT_MARKDOWN_SHORTCUTS, null, 2)
    }));
    setSettingsError('');
  };

  const shortcutDraftObject = useMemo(() => {
    try {
      return normalizeMarkdownShortcuts(JSON.parse(settingsDraft.shortcutsJson || '{}'));
    } catch {
      return normalizeMarkdownShortcuts({});
    }
  }, [settingsDraft.shortcutsJson]);

  const updateShortcutDraft = (action, key) => {
    setSettingsDraft((prev) => {
      let parsed = {};
      try {
        parsed = JSON.parse(prev.shortcutsJson || '{}');
      } catch {
        parsed = shortcutDraftObject;
      }
      const next = normalizeMarkdownShortcuts({ ...parsed, [action]: key });
      return {
        ...prev,
        shortcutsJson: JSON.stringify(next, null, 2)
      };
    });
    setSettingsError('');
  };

  const updateStatusDraft = (statusValue, patch) => {
    setSettingsDraft((prev) => ({
      ...prev,
      statusOptions: normalizeStatusOptions(prev.statusOptions).map((option) => (
        option.value === statusValue
          ? { ...option, ...patch, value: option.value }
          : option
      ))
    }));
  };

  const addStatusDraft = () => {
    setSettingsDraft((prev) => {
      const current = normalizeStatusOptions(prev.statusOptions);
      const value = createUniqueStatusValue('custom', current);
      return {
        ...prev,
        statusOptions: [
          ...current,
          { value, label: 'New Status', color: '#7c5cff' }
        ]
      };
    });
  };

  const removeStatusDraft = (statusValue) => {
    if (DEFAULT_STATUS_VALUES.includes(statusValue)) {
      return;
    }
    setSettingsDraft((prev) => ({
      ...prev,
      statusOptions: normalizeStatusOptions(prev.statusOptions).filter((option) => option.value !== statusValue)
    }));
  };

  const toggleSettingsSection = (sectionKey) => {
    setOpenSettingsSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const renderSettingsSection = (sectionKey, title, children) => {
    const isOpen = Boolean(openSettingsSections[sectionKey]);
    return (
      <section className={`settings-section ${isOpen ? 'is-open' : 'is-collapsed'}`}>
        <button
          type="button"
          className="settings-section-toggle"
          aria-expanded={isOpen}
          onClick={() => toggleSettingsSection(sectionKey)}
        >
          <span className="settings-section-caret">{isOpen ? '▾' : '▸'}</span>
          <span>{title}</span>
        </button>
        {isOpen && (
          <div className="settings-section-body">
            {children}
          </div>
        )}
      </section>
    );
  };

  const openSearchPopup = () => {
    setIsDueOpen(false);
    setIsSearchOpen(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const openDuePopup = () => {
    setIsSearchOpen(false);
    setIsDueOpen(true);
    window.requestAnimationFrame(() => {
      dueInputRef.current?.focus();
    });
  };

  const clearFilters = () => {
    setFilters({
      status: 'all',
      dueBy: '',
      tag: 'all',
      quick: 'all',
      query: ''
    });
    setIsSearchOpen(false);
    setIsDueOpen(false);
  };

  const hasActiveFilters = Boolean(
    filters.query
    || filters.dueBy
    || filters.tag !== 'all'
    || filters.status !== 'all'
    || filters.quick !== 'all'
  );

  useEffect(() => {
    const onBeforeUnload = () => {
      if (noteEditorRef.current && typeof noteEditorRef.current.flush === 'function') {
        noteEditorRef.current.flush();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const modifier = event.metaKey || event.ctrlKey;
      const target = event.target;
      const isTextInput = target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
        || target.closest?.('.cm-editor')
      );

      if (event.key === 'Escape') {
        if (isSettingsOpen) {
          closeSettings();
          return;
        }
        if (modalTaskId) {
          closeModal();
          return;
        }
        if (isDueOpen) {
          setIsDueOpen(false);
          return;
        }
        if (isSearchOpen) {
          setIsSearchOpen(false);
          return;
        }
        setIsMenuOpen(false);
      }

      if (!modifier) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'f') {
        event.preventDefault();
        openSearchPopup();
        return;
      }
      if (!isTextInput && key === 'n') {
        event.preventDefault();
        handleTaskAddClick();
        return;
      }
      if (!isTextInput && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redoTasks();
        } else {
          undoTasks();
        }
        return;
      }
      if (!isTextInput && key === 'y') {
        event.preventDefault();
        redoTasks();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filters, isDueOpen, isSearchOpen, isSettingsOpen, modalTaskId, settings, tasks, modalTagDraft]);

  const splitStyle = isCompact ? undefined : { gridTemplateColumns: `${leftWidth}px 10px minmax(0, 1fr)` };
  const vaultLabel = vaultPath ? getPathBaseName(vaultPath) : 'No Vault';
  const runMenuAction = (action) => () => {
    setIsMenuOpen(false);
    action();
  };
  const currentSortField = getSortField(sortMode);
  const currentSortDirection = getSortDirection(sortMode);

  return (
    <div className="desktop-root">
      <div className="split-layout" ref={splitLayoutRef} style={splitStyle}>
        <aside className="task-panel">
          <div className="panel-top">
            <div className="toolbar-row">
              <button type="button" className="task-add-btn" onClick={handleTaskAddClick}>
                Task Add
              </button>
              <div className="search-anchor" ref={searchPopupRef}>
                <button
                  type="button"
                  className={`search-trigger ${filters.query ? 'is-active' : ''}`}
                  aria-label="Open task search"
                  aria-expanded={isSearchOpen}
                  onClick={openSearchPopup}
                >
                  <AppIcon name="search" />
                </button>
                {isSearchOpen && (
                  <div className="search-popover">
                    <label className="search-popover-field">
                      <span>Search</span>
                      <input
                        ref={searchInputRef}
                        type="search"
                        value={filters.query}
                        onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
                        placeholder="Name, tag, note"
                      />
                    </label>
                    {filters.query && (
                      <button
                        type="button"
                        className="search-clear-btn"
                        onClick={() => {
                          setFilters((prev) => ({ ...prev, query: '' }));
                          searchInputRef.current?.focus();
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="due-anchor" ref={duePopupRef}>
                <button
                  type="button"
                  className={`toolbar-icon-btn ${filters.dueBy ? 'is-active' : ''}`}
                  aria-label="Open due date filter"
                  aria-expanded={isDueOpen}
                  title={filters.dueBy ? `Due by ${filters.dueBy}` : 'Due filter'}
                  onClick={openDuePopup}
                >
                  <AppIcon name="calendar" />
                </button>
                {isDueOpen && (
                  <div className="due-popover">
                    <label className="due-popover-field">
                      <span>Due</span>
                      <input
                        ref={dueInputRef}
                        type="date"
                        value={filters.dueBy}
                        onChange={(event) => setFilters((prev) => ({ ...prev, dueBy: event.target.value }))}
                      />
                    </label>
                    {filters.dueBy && (
                      <button
                        type="button"
                        className="search-clear-btn"
                        onClick={() => {
                          setFilters((prev) => ({ ...prev, dueBy: '' }));
                          dueInputRef.current?.focus();
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`toolbar-icon-btn ${hasActiveFilters ? 'is-active' : ''}`}
                aria-label="Clear filters"
                title="Clear filters"
                disabled={!hasActiveFilters}
                onClick={clearFilters}
              >
                <AppIcon name="eraser" />
              </button>
              {vaultStatus && <span className="vault-status inline-status">{vaultStatus}</span>}
              <div className="toolbar-right-actions">
                <button
                  type="button"
                  className="toolbar-icon-btn"
                  aria-label="Undo"
                  title="Undo"
                  onClick={undoTasks}
                >
                  <AppIcon name="undo" />
                </button>
                <button
                  type="button"
                  className="toolbar-icon-btn"
                  aria-label="Redo"
                  title="Redo"
                  onClick={redoTasks}
                >
                  <AppIcon name="redo" />
                </button>
                <div className="menu-anchor" ref={menuRef}>
                  <button
                    type="button"
                    className="menu-trigger"
                    aria-label="Open actions menu"
                    aria-expanded={isMenuOpen}
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                  >
                    ⋮
                  </button>
                  {isMenuOpen && (
                    <div className="toolbar-menu">
                      <div className="menu-vault">
                        <span className={`vault-chip ${vaultPath ? '' : 'muted'}`} title={vaultPath || 'No vault selected'}>
                          {vaultLabel}
                        </span>
                        <div className="menu-display-controls">
                          <label className="lightning-toggle menu-lightning-toggle" title="Progress line">
                            <input
                              type="checkbox"
                              checked={showLightning}
                              onChange={(event) => setShowLightning(event.target.checked)}
                            />
                            <span>⚡</span>
                          </label>
                          <button
                            type="button"
                            className="theme-toggle menu-theme-toggle"
                            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                          >
                            {theme === 'dark' ? '☀' : '☾'}
                          </button>
                        </div>
                      </div>
                      <button type="button" className="menu-action-btn" onClick={runMenuAction(handleSelectVault)} disabled={isVaultBusy}>
                        Vault
                      </button>
                      <button type="button" className="menu-action-btn" onClick={runMenuAction(handleDisconnectVault)} disabled={!vaultPath || isVaultBusy}>
                        Vault Off
                      </button>
                      <button type="button" className="menu-action-btn" onClick={runMenuAction(handleImportSingleFile)} disabled={isVaultBusy}>
                        Import File
                      </button>
                      <button type="button" className="menu-action-btn" onClick={runMenuAction(openSettings)}>
                        Settings
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="filter-row">
              <label className="filter-field">
                <span>Status</span>
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                >
                  {statusFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="filter-field filter-field-date">
                <span>Quick</span>
                <select
                  value={filters.quick}
                  onChange={(event) => setFilters((prev) => ({ ...prev, quick: event.target.value }))}
                >
                  {QUICK_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="filter-field filter-field-date">
                <span>Tag</span>
                <select
                  value={filters.tag}
                  onChange={(event) => setFilters((prev) => ({ ...prev, tag: event.target.value }))}
                >
                  <option value="all">All</option>
                  {tagPaths.map((tagPath) => (
                    <option key={tagPath} value={tagPath}>{tagLabel(tagPath)}</option>
                  ))}
                </select>
              </label>
              <div className="filter-field filter-field-sort">
                <span>Sort</span>
                <div className="sort-control">
                  <select
                    value={currentSortField}
                    onChange={(event) => setSortMode(buildSortMode(event.target.value, currentSortDirection))}
                  >
                    {TASK_SORT_FIELDS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="sort-direction-btn"
                    aria-label={currentSortDirection === 'Asc' ? 'Switch to descending' : 'Switch to ascending'}
                    title={currentSortDirection === 'Asc' ? 'Ascending' : 'Descending'}
                    onClick={() => setSortMode(buildSortMode(currentSortField, currentSortDirection === 'Asc' ? 'Desc' : 'Asc'))}
                  >
                    {currentSortDirection === 'Asc' ? '▲' : '▼'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="task-scroll" ref={listScrollRef}>
            <div className="task-list-inner" style={{ minHeight: `${chartHeight}px` }}>
              {visibleRows.length === 0 && (
                <div className="empty-row" style={{ height: `${TASK_ROW_HEIGHT}px` }}>
                  No tasks match the current filters.
                </div>
              )}
              {visibleRows.map((row, index) => {
                const metric = rowMetrics.metrics[index];
                if (row.type === 'group') {
                  return (
                    <div
                      className="group-row"
                      style={{
                        height: `${metric?.height || GROUP_ROW_HEIGHT}px`,
                        '--tag-indent': `${row.level * 12}px`,
                        '--group-soft': row.palette.soft,
                        '--group-base': row.palette.base,
                        '--group-strong': row.palette.strong
                      }}
                      key={`group-${row.group}`}
                      onContextMenu={(event) => handleTagRowContextMenu(event, row.group)}
                      title="Right-click to add a task with this tag"
                    >
                      <button
                        type="button"
                        className="group-toggle"
                        onClick={() => toggleGroupCollapsed(row.group)}
                        aria-label={`${row.collapsed ? 'Expand' : 'Collapse'} ${row.group}`}
                      >
                        {row.collapsed ? '▸' : '▾'}
                      </button>
                      <input
                        type="color"
                        className="group-dot-picker"
                        value={row.palette.baseHex}
                        onChange={(event) => {
                          const nextColor = normalizeHexColor(event.target.value);
                          if (!nextColor) {
                            return;
                          }
                          setTagColors((prev) => ({
                            ...prev,
                            [row.group]: nextColor
                          }));
                        }}
                        title={`${row.group} color`}
                        aria-label={`${row.group} color`}
                      />
                      <strong className="group-name">{row.label}</strong>
                      <span className="group-counts" aria-label={statusOptions.map((option) => `${option.label} ${row.statusCounts[option.value] || 0}`).join('、')}>
                        {statusOptions.map((option) => {
                          const colors = statusColorMap[option.value] || statusColorPalette(option.color);
                          return (
                            <span
                              className="group-count"
                              key={option.value}
                              title={option.label}
                              style={{
                                color: colors.color,
                                borderColor: colors.border,
                                backgroundColor: colors.background
                              }}
                            >
                              {row.statusCounts[option.value] || 0}
                            </span>
                          );
                        })}
                      </span>
                    </div>
                  );
                }

                const task = row.task;
                const taskStatus = normalizeStatus(task.status, task.progress, statusOptions);
                const isOverdue = parseDateKey(task.end) < parseDateKey(today) && taskStatus !== 'done';

                return (
                  <div
                    className="task-row compact"
                    style={{
                      height: `${metric?.height || TASK_ROW_HEIGHT}px`,
                      '--task-indent': `${(row.level + 1) * 12}px`,
                      '--group-soft': row.palette.soft,
                      '--group-base': row.palette.base,
                      '--group-strong': row.palette.strong
                    }}
                    key={task.id}
                  >
                    <button type="button" className="task-open-id" onClick={() => setModalTaskId(task.id)}>#{getTaskIndex(task)}</button>
                    <button
                      type="button"
                      className={`task-open-name ${isOverdue ? 'overdue' : ''}`}
                      onClick={() => setModalTaskId(task.id)}
                    >
                      {task.name}
                    </button>
                    <StatusDropdown
                      value={taskStatus}
                      onChange={(status) => updateTask(task.id, { status })}
                      statusOptions={statusOptions}
                      statusColorMap={statusColorMap}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize task list and gantt"
          onMouseDown={startSplitDrag}
        >
          <span />
        </div>

        <section className="gantt-panel">
          <div className="timeline-head" ref={headerScrollRef}>
            <div className="timeline-inner" style={{ width: `${timeline.width}px` }}>
              <div className="month-row">
                {monthSegments.map((segment) => (
                  <div
                    className="month-cell"
                    key={segment.key}
                    style={{ width: `${segment.width}px` }}
                  >
                    {segment.label}
                  </div>
                ))}
              </div>
              <div className="day-row">
                {Array.from({ length: timeline.days }).map((_, index) => {
                  const date = addDays(timeline.start, index);
                  const key = toDateKey(date);
                  const day = String(date.getDate()).padStart(2, '0');
                  const weekday = date.getDay();
                  const dayClass = weekday === 0
                    ? 'sun'
                    : (weekday === 6 ? 'sat' : '');
                  const isToday = key === today;

                  return (
                    <div className={`day-cell ${dayClass} ${isToday ? 'today' : ''}`} key={key}>
                      {day}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="chart-scroll" ref={chartScrollRef}>
            <div
              className="chart-canvas"
              ref={chartCanvasRef}
              style={{
                width: `${timeline.width}px`,
                height: `${chartHeight}px`,
                '--col-width': `${COL_WIDTH}px`
              }}
              onDoubleClick={handleChartDoubleClick}
            >
              {hasTodayInTimeline && (
                <div
                  className="today-column-highlight"
                  style={{
                    left: `${todayColumnLeft}px`,
                    width: `${COL_WIDTH}px`
                  }}
                  aria-hidden="true"
                />
              )}

              {visibleRows.map((row, index) => {
                const metric = rowMetrics.metrics[index];
                if (row.type !== 'group') {
                  return null;
                }

                return (
                  <div
                    className="group-lane"
                    key={`lane-${row.group}`}
                    style={{
                      top: `${metric?.top || 0}px`,
                      height: `${metric?.height || GROUP_ROW_HEIGHT}px`,
                      '--tag-indent': `${row.level * 12}px`,
                      '--group-soft': row.palette.soft,
                      '--group-base': row.palette.base,
                      '--group-strong': row.palette.strong
                    }}
                  >
                    <span>{row.label}</span>
                  </div>
                );
              })}

              {visibleRows.map((row) => {
                if (row.type !== 'group' || !row.aggregate) {
                  return null;
                }
                const position = geometry.get(`group:${row.group}`);
                if (!position) {
                  return null;
                }
                const lagging = parseDateKey(row.aggregate.end) < parseDateKey(today) && row.aggregate.progress < 100;

                return (
                  <div
                    className={`task-bar aggregate-bar status-${row.aggregate.status} ${lagging ? 'lagging' : ''}`}
                    key={`aggregate-${row.group}`}
                    style={{
                      left: `${position.startX}px`,
                      top: `${position.top}px`,
                      width: `${position.width}px`,
                      height: `${AGGREGATE_BAR_HEIGHT}px`,
                      '--group-soft': row.palette.soft,
                      '--group-base': row.palette.base,
                      '--group-strong': row.palette.strong,
                      '--group-fill': row.palette.fill
                    }}
                    title={`${row.label}: ${row.aggregate.start} - ${row.aggregate.end}`}
                  >
                    <div className="task-fill" style={{ width: `${row.aggregate.progress}%` }} />
                    <span className="task-name aggregate-name">
                      {row.label} ({row.aggregate.count})
                    </span>
                  </div>
                );
              })}

              {visibleRows.map((row, index) => {
                const metric = rowMetrics.metrics[index];
                if (row.type !== 'task') {
                  return null;
                }
                const task = row.task;
                const taskStatus = normalizeStatus(task.status, task.progress, statusOptions);
                const taskStatusColors = statusColorMap[taskStatus] || statusColorPalette('#5a7075');
                const position = geometry.get(task.id);
                if (!position) {
                  return null;
                }
                const lagging = parseDateKey(task.end) < parseDateKey(today) && task.progress < 100;
                const isOverdue = parseDateKey(task.end) < parseDateKey(today) && taskStatus !== 'done';
                const barSizeClass = position.width < 44
                  ? 'is-tiny'
                  : (position.width < 72 ? 'is-short' : '');
                return (
                  <div className="row-wrap" key={task.id}>
                    <div
                      className={`task-bar status-${taskStatus} ${lagging ? 'lagging' : ''} ${barSizeClass}`}
                      style={{
                        left: `${position.startX}px`,
                        top: `${position.top}px`,
                        width: `${position.width}px`,
                        '--chart-status-color': taskStatusColors.color,
                        '--group-soft': row.palette.soft,
                        '--group-base': row.palette.base,
                        '--group-strong': row.palette.strong,
                        '--group-fill': row.palette.fill
                      }}
                      onMouseDown={(event) => startDrag(event, task.id, 'move')}
                    >
                      <div className="task-fill" style={{ width: `${task.progress}%` }} />
                      <button
                        type="button"
                        className={`task-name task-name-button ${isOverdue ? 'overdue' : ''}`}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setModalTaskId(task.id);
                        }}
                      >
                        <span className="chart-status-dot" aria-hidden="true" />
                        <span className="chart-task-no">#{getTaskIndex(task)}</span>
                        <span className="chart-task-title">{task.name}</span>
                      </button>
                      <div
                        className="handle left"
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          startDrag(event, task.id, 'resize-start');
                        }}
                      />
                      <div
                        className="handle right"
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          startDrag(event, task.id, 'resize-end');
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              <svg className="relation-layer" width={timeline.width} height={chartHeight}>
                <defs>
                  <marker
                    id="dep-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 4, 0 8" fill="context-stroke" />
                  </marker>
                </defs>

                {relationPaths.parents.map((path, index) => (
                  <path
                    key={`parent-${index}`}
                    d={path}
                    className="parent-line"
                  />
                ))}

                {relationPaths.dependencies.map((dep, index) => (
                  <path
                    key={`dep-${index}`}
                    d={dep.path}
                    className="dep-line"
                    style={{ stroke: dep.color }}
                    markerEnd="url(#dep-arrow)"
                  />
                ))}
              </svg>

              {showLightning && (
                <svg className="progress-layer" width={timeline.width} height={chartHeight}>
                  {lightningData.tagPolylines.map((item) => (
                    <g key={`lightning-${item.tagPath}`}>
                      <polyline
                        points={item.polyline}
                        className="progress-line"
                        style={{ stroke: item.color }}
                      />
                      {item.points.map((point) => (
                        <circle
                          key={`dot-${item.tagPath}-${point.taskId}`}
                          cx={point.x}
                          cy={point.y}
                          r="4"
                          className="progress-dot"
                          style={{ fill: item.dotColor }}
                        />
                      ))}
                    </g>
                  ))}
                  {lightningData.crossTagLines.map((line) => (
                    <path
                      key={`cross-${line.key}`}
                      d={line.path}
                      className="cross-tag-lightning"
                      style={{ stroke: line.color }}
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>
        </section>
      </div>

      {modalTask && (
        <div className="modal-overlay" onClick={closeModal}>
          <section className="task-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Task #{getTaskIndex(modalTask)} Detail</h2>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-copy"
                  onClick={() => duplicateTask(modalTask.id)}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="modal-delete"
                  onClick={() => {
                    removeTask(modalTask.id);
                    setModalTaskId(null);
                  }}
                >
                  Delete
                </button>
                <button type="button" className="modal-close" onClick={closeModal}>Close</button>
              </div>
            </header>

            <div className="modal-grid">
              <datalist id="tag-suggestions">
                {tagPaths
                  .filter((tagPath) => tagPath !== UNTAGGED_KEY)
                  .map((tagPath) => (
                    <option key={tagPath} value={`#${tagPath}`} />
                  ))}
              </datalist>
              <datalist id="dependency-suggestions">
                {tasks
                  .filter((task) => task.id !== modalTask.id)
                  .map((task) => (
                    <option key={task.id} value={String(task.id)} label={`#${getTaskIndex(task)} ${task.name}`} />
                  ))}
              </datalist>
              <label className="modal-field-name">
                <span>Name</span>
                <input
                  type="text"
                  value={modalTask.name}
                  onChange={(event) => updateTask(modalTask.id, { name: event.target.value })}
                />
              </label>

              <label className="modal-field-tags">
                <span>Tags</span>
                <div className="tag-chip-editor">
                  {normalizeTags(modalTask.tags).map((tag) => {
                    const palette = getTagPalette(tag, tagColors);
                    return (
                      <span
                        className="tag-chip"
                        key={tag}
                        style={{
                          '--tag-chip-bg': palette.soft,
                          '--tag-chip-border': palette.base,
                          '--tag-chip-color': palette.strong
                        }}
                      >
                        <span className="tag-chip-label">#{tag}</span>
                        <button
                          type="button"
                          aria-label={`Remove #${tag}`}
                          onClick={() => removeModalTag(tag)}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  <input
                    type="text"
                    placeholder={normalizeTags(modalTask.tags).length === 0 ? '#tag/path' : 'Add tag'}
                    value={modalTagDraft}
                    list="tag-suggestions"
                    onChange={(event) => {
                      setModalTagDraft(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Tab' || event.key === ',' || event.key === ' ') {
                        if (modalTagDraft.trim()) {
                          event.preventDefault();
                          commitTagDraft();
                        }
                      }
                      if (event.key === 'Backspace' && !modalTagDraft && normalizeTags(modalTask.tags).length > 0) {
                        const currentTags = normalizeTags(modalTask.tags);
                        removeModalTag(currentTags[currentTags.length - 1]);
                      }
                    }}
                    onBlur={commitTagDraft}
                  />
                </div>
              </label>

              <label className="modal-field-uid">
                <span>UID</span>
                <input
                  type="text"
                  value={modalTask.uid || ''}
                  readOnly
                  tabIndex={-1}
                />
              </label>

              <label className="modal-field-date modal-field-start">
                <span>Start</span>
                <input
                  type="date"
                  value={modalTask.start}
                  onChange={(event) => updateTask(modalTask.id, { start: event.target.value })}
                />
              </label>

              <label className="modal-field-date modal-field-due">
                <span>Due</span>
                <input
                  type="date"
                  value={modalTask.end}
                  onChange={(event) => updateTask(modalTask.id, { end: event.target.value })}
                />
              </label>

              <label className="modal-field-status">
                <span>Status</span>
                <StatusDropdown
                  className="modal-status-select"
                  value={normalizeStatus(modalTask.status, modalTask.progress, statusOptions)}
                  onChange={(status) => updateTask(modalTask.id, { status })}
                  statusOptions={statusOptions}
                  statusColorMap={statusColorMap}
                />
              </label>

              <label className="modal-field-progress">
                <span>Progress (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={modalTask.progress}
                  onChange={(event) => updateTask(modalTask.id, { progress: Number(event.target.value) })}
                />
              </label>

              <label className="modal-field-depends">
                <span>Depends On</span>
                <input
                  type="text"
                  value={toDependsText(modalTask.dependsOn)}
                  list="dependency-suggestions"
                  onChange={(event) => updateTask(modalTask.id, {
                    dependsOn: parseDependsText(event.target.value, modalTask.id)
                  })}
                />
              </label>
            </div>

            <div className="markdown-section">
              <div className="markdown-section-head">
                <h3>Notes (Markdown Live)</h3>
                <span className="markdown-save-preview">{modalMarkdownPath}</span>
              </div>
              <Suspense fallback={<div className="live-md-loading">Loading editor...</div>}>
                <LiveMarkdownEditor
                  ref={noteEditorRef}
                  editorKey={`note-${modalTask.id}`}
                  markdown={modalTask.markdown}
                  onChange={(value) => updateTask(modalTask.id, { markdown: value })}
                  placeholder="Type task notes with markdown..."
                  markdownShortcuts={settings.markdownShortcuts}
                />
              </Suspense>
            </div>
          </section>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={closeSettings}>
          <section className="task-modal settings-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>General Settings</h2>
              <div className="modal-actions">
                <button type="button" className="modal-close" onClick={saveSettings}>Save</button>
                <button type="button" className="modal-delete" onClick={closeSettings}>Cancel</button>
              </div>
            </header>
            {renderSettingsSection('general', 'General', (
              <div className="settings-grid">
                <label>
                  <span>Index Digits</span>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={settingsDraft.indexDigits}
                    onChange={(event) => setSettingsDraft((prev) => ({ ...prev, indexDigits: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Next Index</span>
                  <input
                    type="number"
                    min="1"
                    value={settingsDraft.nextTaskIndex}
                    onChange={(event) => setSettingsDraft((prev) => ({ ...prev, nextTaskIndex: event.target.value }))}
                  />
                </label>
                <label className="settings-wide">
                  <span>File Name Rule</span>
                  <input
                    type="text"
                    value={settingsDraft.fileNamePattern}
                    placeholder="{index}_{name}"
                    onChange={(event) => setSettingsDraft((prev) => ({ ...prev, fileNamePattern: event.target.value }))}
                  />
                </label>
              </div>
            ))}

            {renderSettingsSection('statuses', 'Statuses', (
              <div className="status-manager-list">
                {normalizeStatusOptions(settingsDraft.statusOptions).map((option) => (
                  <div className="status-manager-row" key={option.value}>
                    <input
                      type="color"
                      value={option.color}
                      aria-label={`${option.label} color`}
                      onChange={(event) => updateStatusDraft(option.value, { color: event.target.value })}
                    />
                    <input
                      type="text"
                      value={option.label}
                      onChange={(event) => updateStatusDraft(option.value, { label: event.target.value })}
                    />
                    <code>{option.value}</code>
                    <button
                      type="button"
                      className="menu-action-btn danger"
                      disabled={DEFAULT_STATUS_VALUES.includes(option.value)}
                      onClick={() => removeStatusDraft(option.value)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="settings-actions">
                  <button type="button" className="menu-action-btn" onClick={addStatusDraft}>
                    Add Status
                  </button>
                </div>
              </div>
            ))}

            {renderSettingsSection('shortcuts', 'Markdown Shortcuts', (
              <div className="shortcut-grid">
                {Object.entries(MARKDOWN_SHORTCUT_ACTIONS).map(([action, config]) => (
                  <label key={action}>
                    <span>{config.label}</span>
                    <input
                      type="text"
                      value={shortcutDraftObject[action] || ''}
                      onChange={(event) => updateShortcutDraft(action, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            ))}

            {renderSettingsSection('shortcutJson', 'Markdown Shortcuts JSON', (
              <>
                <label className="settings-json-field">
                  <span>Markdown Shortcuts JSON</span>
                  <textarea
                    value={settingsDraft.shortcutsJson}
                    spellCheck={false}
                    onChange={(event) => {
                      setSettingsDraft((prev) => ({ ...prev, shortcutsJson: event.target.value }));
                      setSettingsError('');
                    }}
                  />
                </label>
                <div className="settings-actions">
                  <button type="button" className="menu-action-btn" onClick={resetShortcutDraft}>
                    Reset Shortcuts
                  </button>
                  {settingsError && <span className="settings-error">{settingsError}</span>}
                </div>
              </>
            ))}

            {renderSettingsSection('tags', 'Tags', (
              <div className="tag-manager-list">
                <div className="tag-manager-actions">
                  <button
                    type="button"
                    className="menu-action-btn"
                    onClick={handleImportNotesFromVault}
                    disabled={!vaultPath || isVaultBusy}
                  >
                    Import #task Notes
                  </button>
                </div>
                {tagPaths.filter((tagPath) => tagPath !== UNTAGGED_KEY).length === 0 && (
                  <div className="settings-empty">No tags yet.</div>
                )}
                {tagPaths
                  .filter((tagPath) => tagPath !== UNTAGGED_KEY)
                  .map((tagPath) => {
                    const palette = getTagPalette(tagPath, tagColors);
                    return (
                      <div className="tag-manager-row" key={tagPath}>
                        <input
                          type="color"
                          value={palette.baseHex}
                          aria-label={`${tagPath} color`}
                          onChange={(event) => {
                            const nextColor = normalizeHexColor(event.target.value);
                            if (nextColor) {
                              setTagColors((prev) => ({ ...prev, [tagPath]: nextColor }));
                            }
                          }}
                        />
                        <input
                          type="text"
                          value={tagRenameDrafts[tagPath] ?? tagPath}
                          onChange={(event) => setTagRenameDrafts((prev) => ({ ...prev, [tagPath]: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="menu-action-btn"
                          onClick={() => renameTagPath(tagPath, tagRenameDrafts[tagPath] ?? tagPath)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="menu-action-btn danger"
                          onClick={() => deleteTagPath(tagPath)}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
              </div>
            ))}

            {renderSettingsSection('vaultLog', 'Vault Sync Log', (
              <div className="vault-log-list">
                {vaultLog.length === 0 && <div className="settings-empty">No sync log yet.</div>}
                {vaultLog.map((entry, index) => (
                  <div className="vault-log-row" key={`${entry.timestamp}-${index}`}>
                    <span>{entry.timestamp}</span>
                    <strong>{entry.message}</strong>
                  </div>
                ))}
                <div className="settings-empty">Full log: .log/vault_log.log</div>
              </div>
            ))}

            <section className="settings-danger-zone">
              <div>
                <h3>Danger Zone</h3>
                <p>Clear Tasks deletes all tasks from this app. Vault auto-sync may also reflect the empty task list.</p>
              </div>
              <button
                type="button"
                className="menu-action-btn danger"
                onClick={handleClearAllTasks}
                disabled={isVaultBusy}
              >
                Clear Tasks
              </button>
            </section>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
