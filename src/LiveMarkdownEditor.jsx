import { markdown as codeMirrorMarkdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { HighlightStyle, LanguageDescription, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
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
import { tags } from '@lezer/highlight';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

const MARKDOWN_SHORTCUT_ACTIONS = {
  bold: { defaultKey: 'Mod-b', type: 'wrap', before: '**', after: '**' },
  italic: { defaultKey: 'Mod-i', type: 'wrap', before: '*', after: '*' },
  strike: { defaultKey: 'Mod-Shift-x', type: 'wrap', before: '~~', after: '~~' },
  inlineCode: { defaultKey: 'Mod-e', type: 'wrap', before: '`', after: '`' },
  heading1: { defaultKey: 'Mod-Alt-1', type: 'linePrefix', prefix: '# ' },
  heading2: { defaultKey: 'Mod-Alt-2', type: 'linePrefix', prefix: '## ' },
  heading3: { defaultKey: 'Mod-Alt-3', type: 'linePrefix', prefix: '### ' },
  unorderedList: { defaultKey: 'Mod-Shift-8', type: 'linePrefix', prefix: '- ' },
  checklist: { defaultKey: 'Mod-Shift-9', type: 'linePrefix', prefix: '- [ ] ' },
  quote: { defaultKey: 'Mod-Shift-.', type: 'linePrefix', prefix: '> ' },
  table: { defaultKey: 'Mod-Shift-t', type: 'table' },
  currentDate: { defaultKey: 'Mod-Shift-d', type: 'currentDate' }
};

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

function normalizeMarkdownShortcuts(rawShortcuts = {}) {
  return Object.fromEntries(Object.entries(MARKDOWN_SHORTCUT_ACTIONS).map(([action, config]) => {
    const rawKey = rawShortcuts && typeof rawShortcuts[action] === 'string'
      ? rawShortcuts[action].trim()
      : '';
    return [action, rawKey || config.defaultKey];
  }));
}

const taskkanriCodeLanguages = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'javascript', 'mjs', 'cjs'],
    extensions: ['js', 'mjs', 'cjs'],
    load: () => import('@codemirror/lang-javascript').then((module) => module.javascript())
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'typescript'],
    extensions: ['ts'],
    load: () => import('@codemirror/lang-javascript').then((module) => module.javascript({ typescript: true }))
  }),
  LanguageDescription.of({
    name: 'JSX',
    alias: ['jsx', 'react'],
    extensions: ['jsx'],
    load: () => import('@codemirror/lang-javascript').then((module) => module.javascript({ jsx: true }))
  }),
  LanguageDescription.of({
    name: 'TSX',
    alias: ['tsx', 'typescriptreact'],
    extensions: ['tsx'],
    load: () => import('@codemirror/lang-javascript').then((module) => module.javascript({ jsx: true, typescript: true }))
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['css'],
    extensions: ['css'],
    load: () => import('@codemirror/lang-css').then((module) => module.css())
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['html', 'htm'],
    extensions: ['html', 'htm'],
    load: () => import('@codemirror/lang-html').then((module) => module.html())
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json', 'jsonc'],
    extensions: ['json'],
    load: () => import('@codemirror/lang-json').then((module) => module.json())
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py', 'python'],
    extensions: ['py'],
    load: () => import('@codemirror/lang-python').then((module) => module.python())
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sql', 'postgres', 'postgresql', 'mysql', 'sqlite'],
    extensions: ['sql'],
    load: () => import('@codemirror/lang-sql').then((module) => module.sql())
  }),
  LanguageDescription.of({
    name: 'PHP',
    alias: ['php'],
    extensions: ['php'],
    load: () => import('@codemirror/lang-php').then((module) => module.php())
  }),
  LanguageDescription.of({
    name: 'Markdown',
    alias: ['md', 'markdown'],
    extensions: ['md', 'markdown'],
    load: () => import('@codemirror/lang-markdown').then((module) => module.markdown())
  })
];
const taskkanriShellLanguage = LanguageDescription.of({
  name: 'Shell',
  alias: ['bash', 'sh', 'shell', 'zsh'],
  load: () => import('@codemirror/legacy-modes/mode/shell').then((module) => StreamLanguage.define(module.shell))
});
const taskkanriPowerShellLanguage = LanguageDescription.of({
  name: 'PowerShell',
  alias: ['ps1', 'powershell', 'pwsh'],
  load: () => import('@codemirror/legacy-modes/mode/powershell').then((module) => StreamLanguage.define(module.powerShell))
});

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
        const listWidget = listMatch && /\d+\./.test(listMatch[2]) ? `${listMatch[2]} ` : '\u2022 ';
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

function findMarkdownWrapBounds(state, range, before, after) {
  const doc = state.doc;
  if (!range.empty) {
    const beforeFrom = range.from - before.length;
    const afterTo = range.to + after.length;
    if (
      beforeFrom >= 0
      && afterTo <= doc.length
      && doc.sliceString(beforeFrom, range.from) === before
      && doc.sliceString(range.to, afterTo) === after
    ) {
      return {
        beforeFrom,
        beforeTo: range.from,
        afterFrom: range.to,
        afterTo
      };
    }
    return null;
  }

  const line = doc.lineAt(range.from);
  const lineText = line.text;
  const offset = range.from - line.from;
  const beforeIndex = lineText.lastIndexOf(before, offset);
  if (beforeIndex < 0 || beforeIndex + before.length > offset) {
    return null;
  }

  const afterIndex = lineText.indexOf(after, offset);
  if (afterIndex < 0 || afterIndex < beforeIndex + before.length) {
    return null;
  }

  return {
    beforeFrom: line.from + beforeIndex,
    beforeTo: line.from + beforeIndex + before.length,
    afterFrom: line.from + afterIndex,
    afterTo: line.from + afterIndex + after.length
  };
}

function toggleMarkdownWrap(view, before, after) {
  const transaction = view.state.changeByRange((range) => {
    const wrapped = findMarkdownWrapBounds(view.state, range, before, after);
    if (wrapped) {
      const selectionShift = range.from >= wrapped.beforeTo ? before.length : 0;
      return {
        changes: [
          { from: wrapped.beforeFrom, to: wrapped.beforeTo, insert: '' },
          { from: wrapped.afterFrom, to: wrapped.afterTo, insert: '' }
        ],
        range: EditorSelection.range(
          Math.max(wrapped.beforeFrom, range.from - selectionShift),
          Math.max(wrapped.beforeFrom, range.to - selectionShift)
        )
      };
    }

    const selected = view.state.sliceDoc(range.from, range.to);
    const insert = `${before}${selected}${after}`;
    const anchor = range.from + before.length;
    const head = anchor + selected.length;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(anchor, head)
    };
  });

  view.dispatch({
    ...transaction,
    scrollIntoView: true
  });
  return true;
}

function insertMarkdownTable(view) {
  const transaction = view.state.changeByRange((range) => {
    const line = view.state.doc.lineAt(range.from);
    const prefix = line.text.trim() ? '\n\n' : '';
    const suffix = range.to >= view.state.doc.length ? '\n' : '\n\n';
    const beforeCursor = `${prefix}| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| `;
    const afterCursor = ` |  |  |${suffix}`;
    const insert = `${beforeCursor}${afterCursor}`;
    const cursor = range.from + beforeCursor.length;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(cursor)
    };
  });

  view.dispatch({
    ...transaction,
    scrollIntoView: true
  });
  return true;
}

function insertCurrentDate(view) {
  const today = toDateKey(new Date());
  const transaction = view.state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: today },
    range: EditorSelection.cursor(range.from + today.length)
  }));

  view.dispatch({
    ...transaction,
    scrollIntoView: true
  });
  return true;
}

function insertMarkdownLinePrefix(view, prefix) {
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  view.dispatch({
    changes: { from: line.from, insert: prefix },
    selection: { anchor: range.from + prefix.length, head: range.to + prefix.length },
    scrollIntoView: true
  });
  return true;
}

function runMarkdownShortcut(view, action) {
  const config = MARKDOWN_SHORTCUT_ACTIONS[action];
  if (!config) {
    return false;
  }
  if (config.type === 'wrap') {
    return toggleMarkdownWrap(view, config.before, config.after);
  }
  if (config.type === 'linePrefix') {
    return insertMarkdownLinePrefix(view, config.prefix);
  }
  if (config.type === 'table') {
    return insertMarkdownTable(view);
  }
  if (config.type === 'currentDate') {
    return insertCurrentDate(view);
  }
  return false;
}

function buildMarkdownShortcutKeymap(shortcuts) {
  const normalized = normalizeMarkdownShortcuts(shortcuts);
  return Object.entries(normalized)
    .filter(([action, key]) => MARKDOWN_SHORTCUT_ACTIONS[action] && key)
    .map(([action, key]) => ({
      key,
      run: (view) => runMarkdownShortcut(view, action)
    }));
}

const LiveMarkdownEditor = forwardRef(function LiveMarkdownEditor({ markdown, onChange, placeholder, editorKey, markdownShortcuts }, ref) {
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
      ...buildMarkdownShortcutKeymap(markdownShortcuts),
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
  ], [markdownShortcuts, placeholder]);

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

export default LiveMarkdownEditor;
