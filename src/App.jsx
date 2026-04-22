import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MDXEditor,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 96;
const COL_WIDTH = 36;
const STORAGE_KEY = 'taskkanri.desktop.v1';
const SPLIT_KEY = 'taskkanri.desktop.splitWidth.v1';
const VAULT_PATH_KEY = 'taskkanri.desktop.vaultPath.v1';
const IMPORT_TAG = '#task';

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
      start: toDateKey(addDays(today, -3)),
      end: toDateKey(addDays(today, 1)),
      progress: 85,
      parentId: null,
      dependsOn: [],
      markdown: '## Goal\nPlan the milestone and execution order.\n\n- Confirm scope\n- Confirm owner'
    },
    {
      id: 2,
      name: 'UI Draft',
      start: toDateKey(addDays(today, 0)),
      end: toDateKey(addDays(today, 5)),
      progress: 50,
      parentId: 1,
      dependsOn: [1],
      markdown: 'Create first interactive mockups.\n\nReview with the team on Friday.'
    },
    {
      id: 3,
      name: 'Integration',
      start: toDateKey(addDays(today, 6)),
      end: toDateKey(addDays(today, 11)),
      progress: 15,
      parentId: 1,
      dependsOn: [2],
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
  const parentId = rawTask.parentId == null ? null : Number(rawTask.parentId);
  const dependsOn = Array.isArray(rawTask.dependsOn)
    ? [...new Set(rawTask.dependsOn.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0 && value !== id))]
    : [];
  const uid = normalizeUid(rawTask.uid);
  const group = normalizeGroup(rawTask.group);
  const tags = normalizeTags(rawTask.tags);

  return {
    id,
    name: typeof rawTask.name === 'string' && rawTask.name.trim() ? rawTask.name : `Task ${id}`,
    start,
    end: safeEnd,
    progress,
    uid,
    group,
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

function slugifyFileName(input) {
  const slug = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'task';
}

function quoteMetaValue(value) {
  return JSON.stringify(String(value ?? ''));
}

function buildTaskMarkdown(task) {
  const depends = Array.isArray(task.dependsOn)
    ? task.dependsOn.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const tags = normalizeTags(task.tags);
  const parent = Number.isInteger(task.parentId) && task.parentId > 0 ? task.parentId : null;
  const markdownBody = typeof task.markdown === 'string' ? task.markdown.trim() : '';

  return [
    '---',
    'taskkanri: true',
    `id: ${task.id}`,
    `uid: ${quoteMetaValue(task.uid || '')}`,
    `name: ${quoteMetaValue(task.name)}`,
    `group: ${quoteMetaValue(normalizeGroup(task.group))}`,
    `start: ${task.start}`,
    `end: ${task.end}`,
    `progress: ${clamp(Number(task.progress) || 0, 0, 100)}`,
    `parentId: ${parent == null ? 'null' : parent}`,
    `tags: ${JSON.stringify(tags)}`,
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
    const safeBase = `${String(task.id).padStart(4, '0')}-${slugifyFileName(task.name)}`;
    let fileName = `${safeBase}.md`;
    let suffix = 2;
    while (usedNames.has(fileName)) {
      fileName = `${safeBase}-${suffix}.md`;
      suffix += 1;
    }
    usedNames.add(fileName);
    return {
      relativePath: `Taskkanri/${fileName}`,
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

function normalizeGroup(rawGroup) {
  const value = String(rawGroup || '').trim();
  return value || 'General';
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
  const hashTags = text.match(/#[^\s#,]+/g);
  if (hashTags && hashTags.length > 0) {
    return normalizeTags(hashTags.map((tag) => tag.replace(/^#/, '')));
  }
  return normalizeTags(text.split(/[,\s]+/));
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
    uid: '',
    group: 'Inbox',
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
  const uid = normalizeUid(meta.uid);
  const group = normalizeGroup(meta.group);
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
    uid,
    group,
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

function LiveMarkdownEditor({ markdown, onChange, placeholder, editorKey }) {
  return (
    <div className="live-md-editor">
      <MDXEditor
        key={editorKey}
        markdown={markdown}
        onChange={onChange}
        placeholder={placeholder}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          markdownShortcutPlugin()
        ]}
      />
    </div>
  );
}

function App() {
  const [tasks, setTasks] = useState(() => loadInitialTasks());
  const [leftWidth, setLeftWidth] = useState(() => loadInitialSplitWidth());
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= 980);
  const [modalTaskId, setModalTaskId] = useState(null);
  const [vaultPath, setVaultPath] = useState(() => localStorage.getItem(VAULT_PATH_KEY) || '');
  const [vaultStatus, setVaultStatus] = useState('');
  const [isVaultBusy, setIsVaultBusy] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  const orderedTasks = useMemo(() => (
    [...tasks].sort((a, b) => {
      const groupCompare = normalizeGroup(a.group).localeCompare(normalizeGroup(b.group), 'ja');
      if (groupCompare !== 0) {
        return groupCompare;
      }

      const startCompare = parseDateKey(a.start).getTime() - parseDateKey(b.start).getTime();
      if (startCompare !== 0) {
        return startCompare;
      }

      return a.id - b.id;
    })
  ), [tasks]);

  const chartHeight = Math.max(orderedTasks.length * ROW_HEIGHT, ROW_HEIGHT * 2);

  const geometry = useMemo(() => {
    const positions = new Map();
    orderedTasks.forEach((task, index) => {
      const startOffset = daysBetween(timeline.start, task.start);
      const duration = Math.max(1, daysBetween(task.start, task.end) + 1);
      const startX = startOffset * COL_WIDTH + 3;
      const width = Math.max(12, duration * COL_WIDTH - 6);
      const endX = startX + width;
      const centerY = index * ROW_HEIGHT + ROW_HEIGHT / 2;
      positions.set(task.id, {
        startX,
        endX,
        centerY,
        width,
        top: index * ROW_HEIGHT + 14
      });
    });
    return positions;
  }, [orderedTasks, timeline.start]);

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

      const next = typeof updater === 'function' ? updater(task) : { ...task, ...updater };
      const safeStart = next.start;
      const safeEnd = parseDateKey(next.end) < parseDateKey(next.start) ? next.start : next.end;
      return {
        ...task,
        ...next,
        start: safeStart,
        end: safeEnd,
        progress: clamp(Number(next.progress), 0, 100)
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

    addTaskAt({
      name: `Task ${id}`,
      uid,
      group: 'General',
      start,
      end,
      progress: 0,
      parentId: null,
      dependsOn: [],
      tags: ['task'],
      markdown: ''
    });

    setModalTaskId(id);
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
        setVaultPath(result.path);
        showVaultStatus(`Vault selected: ${getPathBaseName(result.path)}`);
      }
    } catch (error) {
      showVaultStatus(`Failed to select vault: ${error.message}`);
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
      const files = buildTaskMarkdownFiles(tasks);
      const result = await api.writeMarkdownFiles(vaultPath, files);
      showVaultStatus(`Exported ${result.writtenCount} tasks to ${getPathBaseName(vaultPath)}/Taskkanri`);
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
        const files = buildTaskMarkdownFiles(tasks);
        await api.writeMarkdownFiles(vaultPath, files);
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
    const row = clamp(Math.floor(y / ROW_HEIGHT), 0, orderedTasks.length);
    const uid = createUid();
    const start = toDateKey(addDays(timeline.start, dayOffset));
    const end = toDateKey(addDays(start, 2));

    addTaskAt({
      name: `Task ${idRef.current}`,
      uid,
      group: 'General',
      start,
      end,
      progress: 0,
      parentId: null,
      dependsOn: [],
      tags: ['task'],
      markdown: ''
    }, row);
  };

  const relationPaths = useMemo(() => {
    const dependencies = [];
    const parents = [];

    orderedTasks.forEach((task) => {
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
        dependencies.push(`M${x1},${y1} L${elbowX},${y1} L${elbowX},${y2} L${x2},${y2}`);
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
  }, [geometry, orderedTasks]);

  const progressPolyline = useMemo(() => {
    const points = orderedTasks
      .map((task) => {
        const position = geometry.get(task.id);
        if (!position) {
          return null;
        }

        const x = position.startX + ((position.endX - position.startX) * task.progress) / 100;
        return `${x},${position.centerY}`;
      })
      .filter(Boolean);

    return points.join(' ');
  }, [geometry, orderedTasks]);

  const today = toDateKey(new Date());
  const validParentOptions = (taskId) => orderedTasks.filter((candidate) => candidate.id !== taskId);

  const modalTask = tasks.find((task) => task.id === modalTaskId) || null;
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
          </div>

          <div className="task-scroll" ref={listScrollRef}>
            <div className="task-list-inner" style={{ minHeight: `${chartHeight}px` }}>
              {orderedTasks.map((task) => (
                <div className="task-row" style={{ height: `${ROW_HEIGHT}px` }} key={task.id}>
                  <div className="task-title-line">
                    <button type="button" className="task-open-id" onClick={() => setModalTaskId(task.id)}>#{task.id}</button>
                    <button type="button" className="task-open-name" onClick={() => setModalTaskId(task.id)}>{task.name}</button>
                    <button
                      type="button"
                      className="delete-btn"
                      onClick={() => removeTask(task.id)}
                      aria-label={`Delete task ${task.id}`}
                    >
                      x
                    </button>
                  </div>
                  <div className="task-meta-line">
                    <span className="group-chip">{normalizeGroup(task.group)}</span>
                    {task.uid && <span className="uid-chip">{task.uid}</span>}
                  </div>

                  <div className="task-controls">
                    <input
                      type="date"
                      value={task.start}
                      onChange={(event) => updateTask(task.id, { start: event.target.value })}
                    />
                    <input
                      type="date"
                      value={task.end}
                      onChange={(event) => updateTask(task.id, { end: event.target.value })}
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={task.progress}
                      onChange={(event) => updateTask(task.id, { progress: Number(event.target.value) })}
                    />
                    <select
                      value={task.parentId ?? ''}
                      onChange={(event) => updateTask(task.id, { parentId: event.target.value ? Number(event.target.value) : null })}
                    >
                      <option value="">No parent</option>
                      {validParentOptions(task.id).map((option) => (
                        <option value={option.id} key={option.id}>#{option.id} {option.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={toDependsText(task.dependsOn)}
                      placeholder="deps"
                      onChange={(event) => updateTask(task.id, {
                        dependsOn: parseDependsText(event.target.value, task.id)
                      })}
                    />
                  </div>
                </div>
              ))}
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
              {Array.from({ length: timeline.days }).map((_, index) => {
                const date = addDays(timeline.start, index);
                const key = toDateKey(date);
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const isMonthTop = date.getDate() === 1 || index === 0;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isToday = key === today;

                return (
                  <div className={`time-cell ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}`} key={key}>
                    <span>{day}</span>
                    {isMonthTop && <small>{month}</small>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="chart-scroll" ref={chartScrollRef}>
            <div
              className="chart-canvas"
              ref={chartCanvasRef}
              style={{
                width: `${timeline.width}px`,
                height: `${chartHeight}px`,
                '--col-width': `${COL_WIDTH}px`,
                '--row-height': `${ROW_HEIGHT}px`
              }}
              onDoubleClick={handleChartDoubleClick}
            >
              {orderedTasks.map((task, index) => {
                const position = geometry.get(task.id);
                if (!position) {
                  return null;
                }

                const lagging = parseDateKey(task.end) < parseDateKey(today) && task.progress < 100;

                return (
                  <div className="row-wrap" key={task.id}>
                    <div
                      className={`task-bar ${lagging ? 'lagging' : ''}`}
                      style={{
                        left: `${position.startX}px`,
                        top: `${position.top}px`,
                        width: `${position.width}px`
                      }}
                      onMouseDown={(event) => startDrag(event, task.id, 'move')}
                    >
                      <div className="task-fill" style={{ width: `${task.progress}%` }} />
                      <span>{task.name}</span>
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
                    <div
                      className="row-label"
                      style={{
                        top: `${index * ROW_HEIGHT + 4}px`
                      }}
                    >
                      #{task.id}
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
                    <polygon points="0 0, 8 4, 0 8" fill="#2f8f79" />
                  </marker>
                </defs>

                {relationPaths.parents.map((path, index) => (
                  <path
                    key={`parent-${index}`}
                    d={path}
                    className="parent-line"
                  />
                ))}

                {relationPaths.dependencies.map((path, index) => (
                  <path
                    key={`dep-${index}`}
                    d={path}
                    className="dep-line"
                    markerEnd="url(#dep-arrow)"
                  />
                ))}
              </svg>

              <svg className="progress-layer" width={timeline.width} height={chartHeight}>
                {progressPolyline && <polyline points={progressPolyline} className="progress-line" />}
                {progressPolyline.split(' ').filter(Boolean).map((point) => (
                  <circle key={point} cx={point.split(',')[0]} cy={point.split(',')[1]} r="4" className="progress-dot" />
                ))}
              </svg>
            </div>
          </div>
        </section>
      </div>

      {modalTask && (
        <div className="modal-overlay" onMouseDown={() => setModalTaskId(null)}>
          <section className="task-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>Task #{modalTask.id} Detail</h2>
              <button type="button" className="modal-close" onClick={() => setModalTaskId(null)}>Close</button>
            </header>

            <div className="modal-grid">
              <label>
                <span>Name</span>
                <input
                  type="text"
                  value={modalTask.name}
                  onChange={(event) => updateTask(modalTask.id, { name: event.target.value })}
                />
              </label>

              <label className="modal-field-date">
                <span>Start</span>
                <input
                  type="date"
                  value={modalTask.start}
                  onChange={(event) => updateTask(modalTask.id, { start: event.target.value })}
                />
              </label>

              <label className="modal-field-date">
                <span>Due</span>
                <input
                  type="date"
                  value={modalTask.end}
                  onChange={(event) => updateTask(modalTask.id, { end: event.target.value })}
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

              <label className="modal-field-uid">
                <span>UID</span>
                <input
                  type="text"
                  value={modalTask.uid || ''}
                  readOnly
                />
              </label>

              <label>
                <span>Group</span>
                <input
                  type="text"
                  value={modalTask.group}
                  onChange={(event) => updateTask(modalTask.id, { group: normalizeGroup(event.target.value) })}
                />
              </label>

              <label>
                <span>Parent</span>
                <select
                  value={modalTask.parentId ?? ''}
                  onChange={(event) => updateTask(modalTask.id, { parentId: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">No parent</option>
                  {validParentOptions(modalTask.id).map((option) => (
                    <option value={option.id} key={option.id}>#{option.id} {option.name}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Depends On (comma IDs)</span>
                <input
                  type="text"
                  value={toDependsText(modalTask.dependsOn)}
                  onChange={(event) => updateTask(modalTask.id, {
                    dependsOn: parseDependsText(event.target.value, modalTask.id)
                  })}
                />
              </label>

              <label>
                <span>tags</span>
                <input
                  type="text"
                  placeholder="#task #work"
                  value={tagsToInput(modalTask.tags)}
                  onChange={(event) => updateTask(modalTask.id, {
                    tags: parseTagsInput(event.target.value)
                  })}
                />
              </label>
            </div>

            <div className="markdown-section">
              <h3>Notes (Markdown Live)</h3>
              <p className="markdown-live-hint">Type markdown shortcuts (for example `#`, `-`, `**`) and it is rendered in place.</p>
              <LiveMarkdownEditor
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
