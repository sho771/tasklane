import { markdown as codeMirrorMarkdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown as markdownCodeLanguage } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { HighlightStyle, LanguageDescription, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder as codeMirrorPlaceholder
} from '@codemirror/view';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { tags } from '@lezer/highlight';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

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
const IMPORT_TAG = '#task';
const UNTAGGED_KEY = '__untagged__';
const STATUS_OPTIONS = [
  { value: 'todo', label: '未着手' },
  { value: 'doing', label: '処理中' },
  { value: 'done', label: '完了' }
];
const STATUS_COLOR_MAP = {
  todo: {
    border: 'rgba(180, 48, 48, 0.22)',
    background: '#ffe5e5',
    color: '#b43030'
  },
  doing: {
    border: 'rgba(44, 91, 154, 0.22)',
    background: '#e6f1ff',
    color: '#2c5b9a'
  },
  done: {
    border: 'rgba(47, 123, 76, 0.22)',
    background: '#e2f7eb',
    color: '#2f7b4c'
  }
};
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: '完了以外' },
  ...STATUS_OPTIONS
];

const taskkanriCodeLanguages = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'javascript', 'mjs', 'cjs'],
    extensions: ['js', 'mjs', 'cjs'],
    support: javascript()
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'typescript'],
    extensions: ['ts'],
    support: javascript({ typescript: true })
  }),
  LanguageDescription.of({
    name: 'JSX',
    alias: ['jsx', 'react'],
    extensions: ['jsx'],
    support: javascript({ jsx: true })
  }),
  LanguageDescription.of({
    name: 'TSX',
    alias: ['tsx', 'typescriptreact'],
    extensions: ['tsx'],
    support: javascript({ jsx: true, typescript: true })
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['css'],
    extensions: ['css'],
    support: css()
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['html', 'htm'],
    extensions: ['html', 'htm'],
    support: html()
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json', 'jsonc'],
    extensions: ['json'],
    support: json()
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py', 'python'],
    extensions: ['py'],
    support: python()
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sql', 'postgres', 'postgresql', 'mysql', 'sqlite'],
    extensions: ['sql'],
    support: sql()
  }),
  LanguageDescription.of({
    name: 'PHP',
    alias: ['php'],
    extensions: ['php'],
    support: php()
  }),
  LanguageDescription.of({
    name: 'Markdown',
    alias: ['md', 'markdown'],
    extensions: ['md', 'markdown'],
    support: markdownCodeLanguage()
  })
];

const taskkanriShellLanguage = StreamLanguage.define(shell);
const taskkanriPowerShellLanguage = StreamLanguage.define(powerShell);

function taskkanriCodeLanguage(info) {
  const languageName = String(info || '').trim().split(/\s+/, 1)[0].toLowerCase();
  if (!languageName) {
    return null;
  }
  if (['bash', 'sh', 'shell', 'zsh'].includes(languageName)) {
    return taskkanriShellLanguage;
  }
  if (['ps1', 'powershell', 'pwsh'].includes(languageName)) {
    return taskkanriPowerShellLanguage;
  }
  return LanguageDescription.matchLanguageName(taskkanriCodeLanguages, languageName, true);
}

const taskkanriMarkdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.28em', fontWeight: '700', color: '#a6e22e' },
  { tag: tags.heading2, fontSize: '1.16em', fontWeight: '700', color: '#a6e22e' },
  { tag: tags.heading3, fontSize: '1.06em', fontWeight: '700', color: '#a6e22e' },
  { tag: tags.strong, fontWeight: '700', color: '#f8f8f2' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#f8f8f2' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, color: '#e6db74', backgroundColor: 'rgba(248, 248, 242, 0.08)' },
  { tag: tags.link, color: '#66d9ef', textDecoration: 'underline' },
  { tag: tags.url, color: '#e6db74' },
  { tag: tags.quote, color: '#75715e', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: '#75715e' },
  { tag: tags.contentSeparator, color: '#75715e' },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], color: '#f92672', fontWeight: '600' },
  { tag: [tags.atom, tags.bool, tags.null], color: '#ae81ff' },
  { tag: [tags.string, tags.character, tags.attributeValue], color: '#e6db74' },
  { tag: [tags.number, tags.integer, tags.float], color: '#ae81ff' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: '#75715e', fontStyle: 'italic' },
  { tag: [tags.variableName, tags.name], color: '#f8f8f2' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#a6e22e' },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: '#a6e22e', fontWeight: '600' },
  { tag: [tags.typeName, tags.className], color: '#66d9ef', fontStyle: 'italic' },
  { tag: tags.tagName, color: '#f92672' },
  { tag: [tags.propertyName, tags.attributeName, tags.labelName], color: '#a6e22e' },
  { tag: [tags.operator, tags.operatorKeyword, tags.compareOperator, tags.logicOperator, tags.arithmeticOperator], color: '#f92672' },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: '#f8f8f2' },
  { tag: tags.invalid, color: '#b43030', textDecoration: 'underline' }
]);

class MarkdownMarkerWidget extends WidgetType {
  constructor(text, className, checkboxFrom = null, checked = false) {
    super();
    this.text = text;
    this.className = className;
    this.checkboxFrom = checkboxFrom;
    this.checked = checked;
  }

  eq(other) {
    return other.text === this.text
      && other.className === this.className
      && other.checkboxFrom === this.checkboxFrom
      && other.checked === this.checked;
  }

  toDOM(view) {
    if (this.checkboxFrom != null) {
      const input = document.createElement('input');
      input.className = this.className;
      input.type = 'checkbox';
      input.checked = this.checked;
      input.setAttribute('aria-label', this.checked ? 'Mark as incomplete' : 'Mark as complete');
      input.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({
          changes: {
            from: this.checkboxFrom,
            to: this.checkboxFrom + 1,
            insert: this.checked ? ' ' : 'x'
          },
          userEvent: 'input'
        });
        view.focus();
      });
      return input;
    }

    const element = document.createElement('span');
    element.className = this.className;
    element.textContent = this.text;
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  ignoreEvent(event) {
    return event.type !== 'click';
  }
}

function isLineInSelection(view, line) {
  return view.state.selection.ranges.some((range) => (
    range.from <= line.to && range.to >= line.from
  ));
}

function addInlineMarkdownDecorations(ranges, line, isSourceLine) {
  const lineText = line.text;
  const add = (from, to, className) => {
    if (to > from) {
      ranges.push(Decoration.mark({ class: className }).range(line.from + from, line.from + to));
    }
  };
  const addMarkup = (from, to) => {
    add(from, to, isSourceLine ? 'cm-md-markup' : 'cm-md-hidden-markup');
  };

  const patterns = [
    { regex: /(\*\*|__)([^*_].*?)\1/g, contentClass: 'cm-md-bold' },
    { regex: /(~~)(.+?)\1/g, contentClass: 'cm-md-strike' },
    { regex: /(\+\+)(.+?)\1/g, contentClass: 'cm-md-underline' },
    { regex: /(`)([^`]+?)\1/g, contentClass: 'cm-md-code' },
    { regex: /(\[)([^\]]+)(\]\([^)]+\))/g, contentClass: 'cm-md-link', split: true }
  ];

  patterns.forEach((item) => {
    let match;
    item.regex.lastIndex = 0;
    while ((match = item.regex.exec(lineText)) !== null) {
      if (item.split) {
        const openStart = match.index;
        const textStart = openStart + match[1].length;
        const textEnd = textStart + match[2].length;
        addMarkup(openStart, textStart);
        add(textStart, textEnd, item.contentClass);
        addMarkup(textEnd, match.index + match[0].length);
      } else {
        const openLength = match[1].length;
        const openStart = match.index;
        const contentStart = openStart + openLength;
        const contentEnd = contentStart + match[2].length;
        const closeEnd = contentEnd + openLength;
        addMarkup(openStart, contentStart);
        add(contentStart, contentEnd, item.contentClass);
        addMarkup(contentEnd, closeEnd);
      }
    }
  });

  const italicRegex = /(^|[^\*])(\*|_)([^\s*_][^*_]*?)\2/g;
  let italicMatch;
  while ((italicMatch = italicRegex.exec(lineText)) !== null) {
    const prefixLength = italicMatch[1].length;
    const markerStart = italicMatch.index + prefixLength;
    const contentStart = markerStart + italicMatch[2].length;
    const contentEnd = contentStart + italicMatch[3].length;
    addMarkup(markerStart, contentStart);
    add(contentStart, contentEnd, 'cm-md-italic');
    addMarkup(contentEnd, contentEnd + italicMatch[2].length);
  }
}

function addLinePrefixDecoration(ranges, line, length, isSourceLine, widgetText, className, startOffset = 0, widgetOptions = {}) {
  if (length <= 0) {
    return;
  }
  const from = line.from + startOffset;
  const to = from + length;
  if (isSourceLine) {
    ranges.push(Decoration.mark({ class: 'cm-md-markup' }).range(from, to));
    return;
  }
  if (widgetText != null) {
    ranges.push(Decoration.widget({
      side: -1,
      widget: new MarkdownMarkerWidget(
        widgetText,
        className,
        widgetOptions.checkboxFrom ?? null,
        widgetOptions.checked ?? false
      )
    }).range(from));
  }
  ranges.push(Decoration.mark({ class: 'cm-md-hidden-markup' }).range(from, to));
}

function buildMarkdownDecorations(view) {
  const ranges = [];
  let inCodeFence = false;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const trimmed = line.text.trim();
      const lineClasses = [];
      const isFence = /^```/.test(trimmed);
      const isSourceLine = isLineInSelection(view, line);
      let prefixDecoration = null;

      if (inCodeFence || isFence) {
        lineClasses.push('cm-md-code-line');
      }
      if (isFence) {
        lineClasses.push('cm-md-code-fence');
      } else if (/^#{1,6}\s/.test(trimmed)) {
        lineClasses.push('cm-md-heading-line');
        const headingMatch = line.text.match(/^(\s*#{1,6}\s+)/);
        prefixDecoration = { length: headingMatch?.[1].length || 0, widgetText: null, className: '' };
      } else if (/^>\s?/.test(trimmed)) {
        lineClasses.push('cm-md-quote-line');
        const quoteMatch = line.text.match(/^(\s*>\s?)/);
        prefixDecoration = { length: quoteMatch?.[1].length || 0, widgetText: null, className: '' };
      } else if (/^[-*+]\s+\[[ xX]\]\s/.test(trimmed)) {
        lineClasses.push('cm-md-check-line');
        const checkMatch = line.text.match(/^(\s*[-*+]\s+\[([ xX])\]\s+)/);
        const checkPrefix = checkMatch?.[1] || '';
        const checkBoxIndex = checkPrefix.search(/\[[ xX]\]/);
        const checked = Boolean(checkMatch && /x/i.test(checkMatch[2]));
        prefixDecoration = {
          startOffset: checkMatch ? checkPrefix.length - checkPrefix.trimStart().length : 0,
          length: checkMatch ? checkPrefix.trimStart().length : 0,
          widgetText: 'checkbox',
          className: 'cm-md-check-widget',
          widgetOptions: {
            checkboxFrom: checkBoxIndex >= 0 ? line.from + checkBoxIndex + 1 : null,
            checked
          }
        };
      } else if (/^([-*+]|\d+\.)\s/.test(trimmed)) {
        lineClasses.push('cm-md-list-line');
        const listMatch = line.text.match(/^(\s*)([-*+]|\d+\.)\s+/);
        const listPrefixLength = listMatch ? listMatch[0].length - listMatch[1].length : 0;
        const listWidget = listMatch && /\d+\./.test(listMatch[2]) ? `${listMatch[2]} ` : '• ';
        prefixDecoration = {
          startOffset: listMatch ? listMatch[1].length : 0,
          length: listPrefixLength,
          widgetText: listWidget,
          className: 'cm-md-list-widget'
        };
      } else if (/^(\|?.+\|.+)$/.test(trimmed)) {
        lineClasses.push('cm-md-table-line');
      } else if (/^(---|\*\*\*|___)$/.test(trimmed)) {
        lineClasses.push('cm-md-hr-line');
      }

      if (lineClasses.length > 0) {
        ranges.push(Decoration.line({ class: lineClasses.join(' ') }).range(line.from));
      }
      if (prefixDecoration) {
        addLinePrefixDecoration(
          ranges,
          line,
          prefixDecoration.length,
          isSourceLine,
          prefixDecoration.widgetText,
          prefixDecoration.className,
          prefixDecoration.startOffset || 0,
          prefixDecoration.widgetOptions || {}
        );
      }
      if (!inCodeFence) {
        addInlineMarkdownDecorations(ranges, line, isSourceLine);
      }
      if (isFence) {
        inCodeFence = !inCodeFence;
      }

      if (line.to >= to) {
        break;
      }
      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

const taskkanriMarkdownDecorations = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildMarkdownDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = buildMarkdownDecorations(update.view);
    }
  }
}, {
  decorations: (plugin) => plugin.decorations
});

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

function sampleTasks() {
  const today = startOfDay(new Date());
  return [
    {
      id: 1,
      name: 'Planning',
      status: 'doing',
      start: toDateKey(addDays(today, -3)),
      end: toDateKey(addDays(today, 1)),
      progress: 85,
      parentId: null,
      dependsOn: [],
      tags: ['task/core'],
      markdown: '## Goal\nPlan the milestone and execution order.\n\n- Confirm scope\n- Confirm owner'
    },
    {
      id: 2,
      name: 'UI Draft',
      status: 'doing',
      start: toDateKey(addDays(today, 0)),
      end: toDateKey(addDays(today, 5)),
      progress: 50,
      parentId: 1,
      dependsOn: [1],
      tags: ['task/core/ui'],
      markdown: 'Create first interactive mockups.\n\nReview with the team on Friday.'
    },
    {
      id: 3,
      name: 'Integration',
      status: 'todo',
      start: toDateKey(addDays(today, 6)),
      end: toDateKey(addDays(today, 11)),
      progress: 15,
      parentId: 1,
      dependsOn: [2],
      tags: ['task/release'],
      markdown: 'Wire API and desktop packaging.'
    }
  ];
}

function normalizeTask(rawTask, fallbackId) {
  const id = Number(rawTask.id) || fallbackId;
  const start = rawTask.start && /^\d{4}-\d{2}-\d{2}$/.test(rawTask.start) ? rawTask.start : toDateKey(new Date());
  const endCandidate = rawTask.end && /^\d{4}-\d{2}-\d{2}$/.test(rawTask.end) ? rawTask.end : start;
  const safeEnd = parseDateKey(endCandidate) < parseDateKey(start) ? start : endCandidate;
  const progress = clamp(Number(rawTask.progress) || 0, 0, 100);
  const normalizedStatus = normalizeStatus(rawTask.status, progress);
  const safeProgress = normalizedStatus === 'done' ? 100 : progress;
  const status = normalizeStatus(rawTask.status, safeProgress);
  const parentId = rawTask.parentId == null ? null : Number(rawTask.parentId);
  const dependsOn = Array.isArray(rawTask.dependsOn)
    ? [...new Set(rawTask.dependsOn.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0 && value !== id))]
    : [];
  const uid = normalizeUid(rawTask.uid);
  const tags = normalizeTags(rawTask.tags);

  return {
    id,
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
    if (!raw) {
      return sampleTasks();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return sampleTasks();
    }

    return parsed.map((task, index) => normalizeTask(task, index + 1));
  } catch {
    return sampleTasks();
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

function getTaskMarkdownRelativePath(task) {
  const folderPath = getTaskFolderPath(task);
  const taskNo = Number.isInteger(Number(task.id)) && Number(task.id) > 0 ? Number(task.id) : 'task';
  const taskName = sanitizePathSegment(task.name, `Task ${taskNo}`);
  return `${folderPath}/${taskNo}_${taskName}.md`;
}

function quoteMetaValue(value) {
  return JSON.stringify(String(value ?? ''));
}

function buildTaskMarkdown(task) {
  const depends = Array.isArray(task.dependsOn)
    ? task.dependsOn.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const tags = normalizeTags(task.tags);
  const markdownBody = typeof task.markdown === 'string' ? task.markdown.trim() : '';

  return [
    '---',
    'taskkanri: true',
    `id: ${task.id}`,
    `uid: ${quoteMetaValue(task.uid || '')}`,
    `name: ${quoteMetaValue(task.name)}`,
    `status: ${quoteMetaValue(normalizeStatus(task.status, task.progress))}`,
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

function buildTaskMarkdownFiles(tasks) {
  const usedNames = new Set();
  return tasks.map((task) => {
    const safePath = getTaskMarkdownRelativePath(task);
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
      content: buildTaskMarkdown(task)
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

function normalizeStatus(rawStatus, progress = 0) {
  const value = String(rawStatus || '').trim().toLowerCase();
  if (value === 'todo' || value === 'doing' || value === 'done') {
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

function StatusDropdown({ value, onChange, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const currentStatus = normalizeStatus(value);
  const currentOption = STATUS_OPTIONS.find((option) => option.value === currentStatus) || STATUS_OPTIONS[0];
  const currentColors = STATUS_COLOR_MAP[currentStatus] || STATUS_COLOR_MAP.todo;

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
        className={`status-chip status-${currentStatus}`}
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
          {STATUS_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === currentStatus}
              className={`status-option status-${option.value} ${option.value === currentStatus ? 'selected' : ''}`}
              style={{
                borderColor: STATUS_COLOR_MAP[option.value].border,
                backgroundColor: STATUS_COLOR_MAP[option.value].background,
                color: STATUS_COLOR_MAP[option.value].color,
                '--status-border': STATUS_COLOR_MAP[option.value].border,
                '--status-bg': STATUS_COLOR_MAP[option.value].background,
                '--status-fg': STATUS_COLOR_MAP[option.value].color
              }}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span className="status-chip-dot" style={{ backgroundColor: STATUS_COLOR_MAP[option.value].color }} />
              <span style={{ color: STATUS_COLOR_MAP[option.value].color }}>{option.label}</span>
            </button>
          ))}
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

function tagsToInput(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return '';
  }
  return tags.map((tag) => `#${tag}`).join(' ');
}

function parseTagsInput(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return [];
  }
  return normalizeTags(text.split(/[,\s]+/));
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

function parseTaskFromMarkdownNote(content, relativePath) {
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
  const start = typeof meta.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.start) ? meta.start : toDateKey(new Date());
  const end = typeof meta.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(meta.end) ? meta.end : toDateKey(addDays(start, 2));
  const progress = clamp(Number(meta.progress) || 0, 0, 100);
  const status = normalizeStatus(meta.status, progress);
  const uid = normalizeUid(meta.uid);
  const parentRaw = Number(meta.parentId);
  const parentId = Number.isInteger(parentRaw) && parentRaw > 0 && parentRaw !== id ? parentRaw : null;
  const dependsOn = parseDependsMeta(meta.dependsOn, id);
  const tags = normalizeTags(meta.tags);

  return {
    id,
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

function parseTasksFromMarkdown(content, relativePath) {
  const { frontmatter } = splitFrontmatter(content);
  const meta = parseFrontmatterBlock(frontmatter);
  const isTaskkanriNote = Boolean(meta.taskkanri) || meta.id != null || meta.start != null || meta.end != null;
  if (isTaskkanriNote) {
    return [parseTaskFromMarkdownNote(content, relativePath)];
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

const LiveMarkdownEditor = forwardRef(function LiveMarkdownEditor({ markdown, onChange, placeholder, editorKey }, ref) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const latestMarkdownRef = useRef(markdown || '');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(() => [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    codeMirrorMarkdown({ codeLanguages: taskkanriCodeLanguage }),
    syntaxHighlighting(taskkanriMarkdownHighlight),
    taskkanriMarkdownDecorations,
    codeMirrorPlaceholder(placeholder),
    EditorView.lineWrapping,
    keymap.of([
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap
    ]),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) {
        return;
      }
      const value = update.state.doc.toString();
      latestMarkdownRef.current = value;
      onChangeRef.current(value);
    })
  ], [placeholder]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: markdown || '',
        extensions
      })
    });
    viewRef.current = view;
    latestMarkdownRef.current = markdown || '';

    return () => {
      view.destroy();
      if (viewRef.current === view) {
        viewRef.current = null;
      }
    };
  }, [editorKey, extensions]);

  useEffect(() => {
    const view = viewRef.current;
    const nextMarkdown = markdown || '';
    latestMarkdownRef.current = nextMarkdown;
    if (!view || view.state.doc.toString() === nextMarkdown) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: nextMarkdown
      }
    });
  }, [editorKey, markdown]);

  const flush = () => {
    if (viewRef.current) {
      const currentMarkdown = viewRef.current.state.doc.toString();
      latestMarkdownRef.current = currentMarkdown;
      onChangeRef.current(currentMarkdown);
    }
  };

  useImperativeHandle(ref, () => ({
    flush
  }), []);

  return (
    <div
      key={editorKey}
      className="live-md-editor live-md-codemirror"
      ref={containerRef}
    />
  );
});

function App() {
  const [tasks, setTasks] = useState(() => loadInitialTasks());
  const [leftWidth, setLeftWidth] = useState(() => loadInitialSplitWidth());
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= 980);
  const [modalTaskId, setModalTaskId] = useState(null);
  const [vaultPath, setVaultPath] = useState(() => localStorage.getItem(VAULT_PATH_KEY) || '');
  const [vaultStatus, setVaultStatus] = useState('');
  const [isVaultBusy, setIsVaultBusy] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLightning, setShowLightning] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [tagColors, setTagColors] = useState(() => loadInitialTagColors());
  const [collapsedTags, setCollapsedTags] = useState({});
  const [filters, setFilters] = useState({
    status: 'all',
    dueBy: '',
    tag: 'all'
  });

  const idRef = useRef(tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1);
  const headerScrollRef = useRef(null);
  const listScrollRef = useRef(null);
  const chartScrollRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const splitLayoutRef = useRef(null);
  const syncLockRef = useRef(false);
  const dragRef = useRef(null);
  const splitDragRef = useRef(null);
  const menuRef = useRef(null);
  const statusTimerRef = useRef(null);
  const autoSyncTimerRef = useRef(null);

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

  const timeline = useMemo(() => {
    if (tasks.length === 0) {
      const today = startOfDay(new Date());
      const start = addDays(today, -7);
      const end = addDays(today, 21);
      const days = daysBetween(start, end) + 1;
      return {
        start: toDateKey(start),
        days,
        width: days * COL_WIDTH
      };
    }

    const starts = tasks.map((task) => parseDateKey(task.start).getTime());
    const ends = tasks.map((task) => parseDateKey(task.end).getTime());
    const first = new Date(Math.min(...starts));
    const last = new Date(Math.max(...ends));
    const start = addDays(first, -6);
    const end = addDays(last, 12);
    const days = daysBetween(start, end) + 1;

    return {
      start: toDateKey(start),
      days,
      width: days * COL_WIDTH
    };
  }, [tasks]);

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

  const orderedTasks = useMemo(() => (
    [...tasks].sort((a, b) => {
      const startCompare = parseDateKey(a.start).getTime() - parseDateKey(b.start).getTime();
      if (startCompare !== 0) {
        return startCompare;
      }

      const endCompare = parseDateKey(a.end).getTime() - parseDateKey(b.end).getTime();
      if (endCompare !== 0) {
        return endCompare;
      }

      return a.id - b.id;
    })
  ), [tasks]);

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

  const tagOptions = useMemo(() => (
    tagPaths.filter((path) => path !== UNTAGGED_KEY && path.split('/').length === 1)
  ), [tagPaths]);

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
      return changed ? next : prev;
    });
  }, [tagPaths]);

  const filteredTasks = useMemo(() => (
    orderedTasks.filter((task) => {
      const status = normalizeStatus(task.status, task.progress);
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
      return true;
    })
  ), [filters, orderedTasks]);

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
      const status = normalizeStatus(task.status, task.progress);
      return {
        ...counts,
        [status]: counts[status] + 1
      };
    }, { todo: 0, doing: 0, done: 0 });

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
      const statuses = tasksForPath.map((task) => normalizeStatus(task.status, task.progress));
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
  }, [collapsedTags, filteredTasks, tagColors]);

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

  const updateTask = (taskId, updater) => {
    setTasks((prev) => prev.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      const patch = typeof updater === 'function' ? updater(task) : updater;
      const next = { ...task, ...(patch || {}) };
      const safeStart = next.start;
      const safeEnd = parseDateKey(next.end) < parseDateKey(next.start) ? next.start : next.end;
      const requestedStatus = normalizeStatus(next.status, next.progress);
      const statusChanged = Boolean(patch) && Object.prototype.hasOwnProperty.call(patch, 'status');
      const nextProgress = statusChanged
        ? statusProgressValue(requestedStatus, next.progress)
        : clamp(Number(next.progress) || 0, 0, 100);
      const progressWithStatus = requestedStatus === 'done' ? 100 : nextProgress;
      return {
        ...task,
        ...next,
        start: safeStart,
        end: safeEnd,
        progress: progressWithStatus,
        status: normalizeStatus(next.status, progressWithStatus)
      };
    }));
  };

  const removeTask = (taskId) => {
    setTasks((prev) => prev
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
      id
    }, id);

    setTasks((prev) => {
      const next = [...prev];
      const safeIndex = clamp(index, 0, next.length);
      next.splice(safeIndex, 0, normalized);
      return next;
    });
  };

  const handleTaskAddClick = () => {
    const id = idRef.current;
    const uid = createUid();
    const start = toDateKey(new Date());
    const end = toDateKey(addDays(start, 2));
    const initialStatus = (filters.status === 'done' || filters.status === 'doing' || filters.status === 'todo')
      ? filters.status
      : 'todo';
    const initialTags = filters.tag === 'all'
      ? ['task']
      : (filters.tag === UNTAGGED_KEY ? [] : [filters.tag]);

    addTaskAt({
      name: `Task ${id}`,
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
  };

  const toggleGroupCollapsed = (group) => {
    setCollapsedTags((prev) => ({
      ...prev,
      [group]: !prev[group]
    }));
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

    const ok = window.confirm('Delete all tasks? This action cannot be undone.');
    if (!ok) {
      return;
    }

    setTasks([]);
    setModalTaskId(null);
    idRef.current = 1;
    showVaultStatus('All tasks deleted.');
  };

  const syncTasksToVault = async (targetVaultPath, targetTasks, options = {}) => {
    const api = getDesktopApi();
    if (!targetVaultPath || !api) {
      return { writtenCount: 0, deletedCount: 0 };
    }

    const files = buildTaskMarkdownFiles(targetTasks);
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
      }, resolvedId);
      next.push(normalized);
      usedIds.add(normalized.id);
      maxId = Math.max(maxId, normalized.id);
      importedCount += 1;
    });

    idRef.current = Math.max(maxId + 1, 1);
    setTasks(next);
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
      return parseTasksFromMarkdown(file.content, file.relativePath);
    });

    if (parsedRecords.length === 0) {
      return { importedCount: 0 };
    }

    return replaceTasksWithImportedRecords(parsedRecords);
  };

  const showVaultStatus = (message) => {
    setVaultStatus(message);
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
          showVaultStatus(`Vault selected: ${vaultName}. Loaded ${importedCount} tasks.`);
        } else {
          showVaultStatus(`Vault selected: ${vaultName}. No task markdown found.`);
        }
      }
    } catch (error) {
      showVaultStatus(`Failed to select vault: ${error.message}`);
    } finally {
      setIsVaultBusy(false);
    }
  };

  const handleExportTasksToVault = async () => {
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
      const result = await syncTasksToVault(vaultPath, tasks, { deleteStaleManaged: true });
      const deletedText = result.deletedCount ? ` / Deleted ${result.deletedCount}` : '';
      showVaultStatus(`Exported ${result.writtenCount}${deletedText} tasks to ${getPathBaseName(vaultPath)}`);
    } catch (error) {
      showVaultStatus(`Export failed: ${error.message}`);
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

    setTasks((prev) => {
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
          }, preservedId);
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
          }, incomingId);
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
        }, resolvedId);
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
        return parseTasksFromMarkdown(file.content, file.relativePath);
      });

      if (parsedRecords.length === 0) {
        const fullScan = await api.listMarkdownFiles({ vaultPath });
        files = Array.isArray(fullScan.files) ? fullScan.files : [];
        parsedRecords = files.flatMap((file) => {
          if (!file || typeof file.relativePath !== 'string' || typeof file.content !== 'string') {
            return [];
          }
          return parseTasksFromMarkdown(file.content, file.relativePath);
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
      const parsedRecords = parseTasksFromMarkdown(selected.content, relativePath);
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
        await syncTasksToVault(vaultPath, tasks, { deleteStaleManaged: true });
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
  }, [tasks, vaultPath, isVaultBusy]);

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
      : (targetRow?.group || tagOptions[0] || 'task');
    const fallbackTags = fallbackTag === UNTAGGED_KEY ? [] : [fallbackTag];

    addTaskAt({
      name: `Task ${idRef.current}`,
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

  const today = toDateKey(new Date());

  const modalTask = tasks.find((task) => task.id === modalTaskId) || null;
  const [modalTagsInput, setModalTagsInput] = useState('');
  const noteEditorRef = useRef(null);

  useEffect(() => {
    if (!modalTask) {
      setModalTagsInput('');
      return;
    }
    setModalTagsInput(tagsToInput(modalTask.tags));
  }, [modalTaskId, modalTask?.tags]);

  const commitModalDrafts = () => {
    if (modalTask) {
      updateTask(modalTask.id, {
        tags: parseTagsInput(modalTagsInput)
      });
      setModalTagsInput(tagsToInput(parseTagsInput(modalTagsInput)));
    }
    if (noteEditorRef.current && typeof noteEditorRef.current.flush === 'function') {
      noteEditorRef.current.flush();
    }
  };

  const closeModal = () => {
    commitModalDrafts();
    setModalTaskId(null);
  };

  const splitStyle = isCompact ? undefined : { gridTemplateColumns: `${leftWidth}px 10px minmax(0, 1fr)` };
  const vaultLabel = vaultPath ? getPathBaseName(vaultPath) : 'No Vault';
  const runMenuAction = (action) => () => {
    setIsMenuOpen(false);
    action();
  };

  return (
    <div className="desktop-root">
      <div className="split-layout" ref={splitLayoutRef} style={splitStyle}>
        <aside className="task-panel">
          <div className="panel-top">
            <div className="toolbar-row">
              <button type="button" className="task-add-btn" onClick={handleTaskAddClick}>
                Task Add
              </button>
              <label className="lightning-toggle">
                <input
                  type="checkbox"
                  checked={showLightning}
                  onChange={(event) => setShowLightning(event.target.checked)}
                />
                <span>⚡</span>
              </label>
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark' ? '☀' : '☾'}
              </button>
              {vaultStatus && <span className="vault-status inline-status">{vaultStatus}</span>}
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
                    </div>
                    <button type="button" className="menu-action-btn" onClick={runMenuAction(handleSelectVault)} disabled={isVaultBusy}>
                      Vault
                    </button>
                    <button type="button" className="menu-action-btn" onClick={runMenuAction(handleDisconnectVault)} disabled={!vaultPath || isVaultBusy}>
                      Vault Off
                    </button>
                    <button type="button" className="menu-action-btn" onClick={runMenuAction(handleExportTasksToVault)} disabled={!vaultPath || isVaultBusy}>
                      Export
                    </button>
                    <button type="button" className="menu-action-btn" onClick={runMenuAction(handleImportNotesFromVault)} disabled={!vaultPath || isVaultBusy}>
                      Import Tag
                    </button>
                    <button type="button" className="menu-action-btn" onClick={runMenuAction(handleImportSingleFile)} disabled={isVaultBusy}>
                      Import File
                    </button>
                    <button type="button" className="menu-action-btn danger" onClick={runMenuAction(handleClearAllTasks)} disabled={isVaultBusy}>
                      Clear Tasks
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="filter-row">
              <label className="filter-field">
                <span>Status</span>
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                >
                  {STATUS_FILTER_OPTIONS.map((option) => (
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
              <label className="filter-field filter-field-date">
                <span>Due</span>
                <input
                  type="date"
                  value={filters.dueBy}
                  onChange={(event) => setFilters((prev) => ({ ...prev, dueBy: event.target.value }))}
                />
              </label>
              <button
                type="button"
                className="filter-clear-btn"
                onClick={() => setFilters({
                  status: 'all',
                  dueBy: '',
                  tag: 'all'
                })}
              >
                Clear
              </button>
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
                      <span className="group-counts" aria-label={`未着手 ${row.statusCounts.todo}、処理中 ${row.statusCounts.doing}、完了 ${row.statusCounts.done}`}>
                        <span className="group-count count-todo" title="未着手">{row.statusCounts.todo}</span>
                        <span className="group-count count-doing" title="処理中">{row.statusCounts.doing}</span>
                        <span className="group-count count-done" title="完了">{row.statusCounts.done}</span>
                      </span>
                    </div>
                  );
                }

                const task = row.task;
                const taskStatus = normalizeStatus(task.status, task.progress);
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
                    <button type="button" className="task-open-id" onClick={() => setModalTaskId(task.id)}>#{task.id}</button>
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
                const taskStatus = normalizeStatus(task.status, task.progress);
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
                        '--chart-status-color': STATUS_COLOR_MAP[taskStatus].color,
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
                        <span className="chart-task-no">#{task.id}</span>
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
              <h2>Task #{modalTask.id} Detail</h2>
              <div className="modal-actions">
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
                <input
                  type="text"
                  placeholder="#task/hoge #work"
                  value={modalTagsInput}
                  onChange={(event) => {
                    setModalTagsInput(event.target.value);
                  }}
                  onBlur={() => {
                    commitModalDrafts();
                  }}
                />
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
                  value={normalizeStatus(modalTask.status, modalTask.progress)}
                  onChange={(status) => updateTask(modalTask.id, { status })}
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
                  onChange={(event) => updateTask(modalTask.id, {
                    dependsOn: parseDependsText(event.target.value, modalTask.id)
                  })}
                />
              </label>
            </div>

            <div className="markdown-section">
              <h3>Notes (Markdown Live)</h3>
              <LiveMarkdownEditor
                ref={noteEditorRef}
                editorKey={`note-${modalTask.id}`}
                markdown={modalTask.markdown}
                onChange={(value) => updateTask(modalTask.id, { markdown: value })}
                placeholder="Type task notes with markdown..."
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
