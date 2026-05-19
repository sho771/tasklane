import { ItemView, MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  TasklaneSettings,
  TasklaneTask,
  buildTaskFileName,
  buildTaskNoteMarkdown,
  parseTasklaneLines,
  parseTasklaneNote,
  toDateKey
} from './tasklane';

const VIEW_TYPE_TASKLANE = 'tasklane-view';

type TasklaneRow =
  | {
      type: 'group';
      tag: string;
      level: number;
      count: number;
    }
  | {
      type: 'task';
      task: TasklaneTask;
      level: number;
    };

type ChartDragState = {
  task: TasklaneTask;
  mode: 'move' | 'start' | 'end';
  startClientX: number;
  originalStart: string;
  originalEnd: string;
  lastDiffDays: number;
  moved: boolean;
};

export default class TasklanePlugin extends Plugin {
  settings: TasklaneSettings = DEFAULT_SETTINGS;
  private view: TasklaneView | null = null;
  private refreshTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_TASKLANE,
      (leaf) => {
        this.view = new TasklaneView(leaf, this);
        return this.view;
      }
    );

    this.addRibbonIcon('calendar-check', 'Open Tasklane', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-tasklane-view',
      name: 'Open Tasklane view',
      callback: () => this.activateView()
    });

    this.addCommand({
      id: 'create-tasklane-task-note',
      name: 'Create Tasklane task note',
      callback: () => this.createTaskNote()
    });

    this.addCommand({
      id: 'refresh-tasklane-tasks',
      name: 'Refresh Tasklane tasks',
      callback: () => this.refreshView()
    });

    this.registerEvent(this.app.vault.on('create', (file) => this.scheduleRefreshIfMarkdown(file)));
    this.registerEvent(this.app.vault.on('modify', (file) => this.scheduleRefreshIfMarkdown(file)));
    this.registerEvent(this.app.vault.on('delete', (file) => this.scheduleRefreshIfMarkdown(file)));
    this.registerEvent(this.app.vault.on('rename', (file) => this.scheduleRefreshIfMarkdown(file)));
  }

  onunload() {
    if (this.refreshTimer != null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async loadSettings() {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...await this.loadData()
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    try {
      const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASKLANE);
      if (existingLeaves.length > 0) {
        this.app.workspace.revealLeaf(existingLeaves[0]);
        await this.refreshView();
        return;
      }

      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_TASKLANE, active: true });
      this.app.workspace.revealLeaf(leaf);
      await this.refreshView();
    } catch (error) {
      console.error('Failed to open Tasklane view', error);
      new Notice('Failed to open Tasklane view. Check the developer console for details.');
    }
  }

  async refreshView() {
    await this.view?.refresh();
  }

  async loadTasks(): Promise<TasklaneTask[]> {
    const tasks: TasklaneTask[] = [];
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const noteTask = parseTasklaneNote(content, file.path);
      if (noteTask) {
        tasks.push(noteTask);
      }
      tasks.push(...parseTasklaneLines(content, file.path));
    }
    return tasks.sort((a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name));
  }

  async openTask(task: TasklaneTask) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice(`Task file not found: ${task.path}`);
      return;
    }

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);

    if (task.kind === 'line' && task.line) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const line = Math.max(task.line - 1, 0);
        view.editor.setCursor({ line, ch: 0 });
        view.editor.scrollIntoView({
          from: { line, ch: 0 },
          to: { line, ch: 0 }
        }, true);
      }
    }
  }

  async createTaskNote() {
    const name = '新規タスク';
    const folder = this.settings.taskFolder.trim().replace(/^\/|\/$/g, '') || DEFAULT_SETTINGS.taskFolder;
    await this.ensureFolder(folder);

    let fileName = buildTaskFileName(name, this.settings);
    let path = `${folder}/${fileName}`;
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(path)) {
      fileName = buildTaskFileName(`${name} ${suffix}`, this.settings);
      path = `${folder}/${fileName}`;
      suffix += 1;
    }

    const file = await this.app.vault.create(path, buildTaskNoteMarkdown(name, this.settings));
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice(`Created Tasklane note: ${path}`);
    await this.refreshView();
  }

  async updateTaskDates(task: TasklaneTask, start: string, end: string) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice(`Task file not found: ${task.path}`);
      return;
    }

    const safeEnd = parseDateKey(end) < parseDateKey(start) ? start : end;
    const content = await this.app.vault.read(file);
    const nextContent = task.kind === 'note'
      ? updateTasklaneNoteDates(content, start, safeEnd)
      : updateTasklaneLineDates(content, task.line, start, safeEnd);

    if (nextContent === content) {
      return;
    }

    await this.app.vault.modify(file, nextContent);
    task.start = start;
    task.end = safeEnd;
    await this.refreshView();
  }

  private scheduleRefreshIfMarkdown(file: unknown) {
    if (!(file instanceof TFile) || file.extension !== 'md') {
      return;
    }
    if (this.refreshTimer != null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshView();
    }, 350);
  }

  private async ensureFolder(folderPath: string) {
    const parts = folderPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}

class TasklaneView extends ItemView {
  private plugin: TasklanePlugin;
  private tasks: TasklaneTask[] = [];
  private statusFilter = 'all';
  private tagFilter = 'all';
  private scrollLock = false;
  private chartDrag: ChartDragState | null = null;
  private suppressChartClick = false;

  constructor(leaf: WorkspaceLeaf, plugin: TasklanePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_TASKLANE;
  }

  getDisplayText() {
    return 'Tasklane';
  }

  getIcon() {
    return 'calendar-check';
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    this.tasks = await this.plugin.loadTasks();
    this.render();
  }

  private render() {
    const container = this.contentEl;
    container.empty();
    container.addClass('tasklane-plugin-view');

    const visibleTasks = this.getVisibleTasks();
    const visibleRows = buildGroupedRows(visibleTasks);
    const toolbar = container.createDiv({ cls: 'tasklane-plugin-toolbar' });
    toolbar.createEl('h2', { cls: 'tasklane-plugin-title', text: 'Tasklane' });
    toolbar.createSpan({ cls: 'tasklane-plugin-status', text: `${visibleTasks.length} / ${this.tasks.length} tasks` });
    toolbar.createSpan({ cls: 'tasklane-plugin-spacer' });

    const statusSelect = toolbar.createEl('select', { cls: 'tasklane-plugin-filter' });
    [
      ['all', 'All status'],
      ['todo', 'Todo'],
      ['doing', 'Doing'],
      ['done', 'Done']
    ].forEach(([value, label]) => {
      const option = statusSelect.createEl('option', { text: label });
      option.value = value;
      option.selected = this.statusFilter === value;
    });
    statusSelect.addEventListener('change', () => {
      this.statusFilter = statusSelect.value;
      this.render();
    });

    const tagSelect = toolbar.createEl('select', { cls: 'tasklane-plugin-filter' });
    const allOption = tagSelect.createEl('option', { text: 'All tags' });
    allOption.value = 'all';
    allOption.selected = this.tagFilter === 'all';
    for (const tag of this.getAllTags()) {
      const option = tagSelect.createEl('option', { text: `#${tag}` });
      option.value = tag;
      option.selected = this.tagFilter === tag;
    }
    tagSelect.addEventListener('change', () => {
      this.tagFilter = tagSelect.value;
      this.render();
    });

    const newButton = toolbar.createEl('button', { cls: 'tasklane-plugin-button', text: 'New Task' });
    newButton.addEventListener('click', () => this.plugin.createTaskNote());

    const refreshButton = toolbar.createEl('button', { cls: 'tasklane-plugin-button', text: 'Refresh' });
    refreshButton.addEventListener('click', () => this.refresh());

    if (this.tasks.length === 0) {
      const empty = container.createDiv({ cls: 'tasklane-plugin-empty tasklane-plugin-empty-wide' });
      empty.setText('No tasklane:true notes or #task checklist lines found.');
      return;
    }

    if (visibleTasks.length === 0) {
      const empty = container.createDiv({ cls: 'tasklane-plugin-empty tasklane-plugin-empty-wide' });
      empty.setText('No tasks match the current filters.');
      return;
    }

    const board = container.createDiv({ cls: 'tasklane-plugin-board' });
    const list = board.createDiv({ cls: 'tasklane-plugin-list' });
    const chart = board.createDiv({ cls: 'tasklane-plugin-chart' });
    this.renderList(list, visibleRows);
    this.renderChart(chart, visibleRows, visibleTasks);
    this.syncVerticalScroll(list, chart);
  }

  private getVisibleTasks(): TasklaneTask[] {
    return this.tasks.filter((task) => {
      if (this.statusFilter !== 'all' && task.status !== this.statusFilter) {
        return false;
      }
      if (this.tagFilter !== 'all' && !getGroupingTags(task).some((tag) => isTagMatch(tag, this.tagFilter))) {
        return false;
      }
      return true;
    });
  }

  private getAllTags(): string[] {
    const tags = new Set<string>();
    for (const task of this.tasks) {
      getGroupingTags(task).forEach((tag) => tags.add(tag));
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  private renderList(container: HTMLElement, taskRows: TasklaneRow[]) {
    const header = container.createDiv({ cls: 'tasklane-plugin-list-header' });
    header.createSpan({ text: 'Task' });
    header.createSpan({ text: 'Due' });
    header.createSpan({ text: 'Status' });

    const rowContainer = container.createDiv({ cls: 'tasklane-plugin-list-rows' });

    for (const item of taskRows) {
      if (item.type === 'group') {
        const groupRow = rowContainer.createDiv({ cls: 'tasklane-plugin-group-row' });
        groupRow.style.setProperty('--tasklane-indent', `${item.level * 16}px`);
        const palette = tagPalette(item.tag);
        const groupName = groupRow.createSpan({ cls: 'tasklane-plugin-group-name' });
        groupName.style.setProperty('--tasklane-tag-bg', palette.bg);
        groupName.style.setProperty('--tasklane-tag-border', palette.border);
        groupName.style.setProperty('--tasklane-tag-text', palette.text);
        groupName.createSpan({ cls: 'tasklane-plugin-tag-chip', text: `#${item.tag}` });
        groupRow.createSpan({ cls: 'tasklane-plugin-group-count', text: `${item.count}` });
        continue;
      }

      const task = item.task;
      const row = rowContainer.createDiv({ cls: 'tasklane-plugin-task' });
      row.style.setProperty('--tasklane-indent', `${item.level * 16}px`);
      row.title = task.name;

      const openButton = row.createEl('button', { cls: 'tasklane-plugin-open' });
      openButton.addEventListener('click', () => this.plugin.openTask(task));
      openButton.createSpan({ cls: 'tasklane-plugin-task-name', text: task.name });
      row.createSpan({ cls: 'tasklane-plugin-task-meta', text: task.end });
      row.createSpan({ cls: 'tasklane-plugin-task-meta', text: task.status });
    }
  }

  private renderChart(container: HTMLElement, rows: TasklaneRow[], tasks: TasklaneTask[]) {
    if (tasks.length === 0) {
      return;
    }

    const timeline = buildTimeline(tasks);
    const grid = container.createDiv({ cls: 'tasklane-plugin-chart-grid' });
    grid.style.setProperty('--tasklane-days', String(timeline.days));
    grid.style.setProperty('--tasklane-col-width', '28px');

    const monthHeader = grid.createDiv({ cls: 'tasklane-plugin-chart-month-header' });
    for (const segment of buildMonthSegments(timeline)) {
      const month = monthHeader.createDiv({
        cls: 'tasklane-plugin-chart-month',
        text: segment.label
      });
      month.style.gridColumn = `${segment.start + 1} / span ${segment.days}`;
      month.style.gridRow = '1';
    }

    const header = grid.createDiv({ cls: 'tasklane-plugin-chart-header' });
    for (let index = 0; index < timeline.days; index += 1) {
      const date = addDays(timeline.start, index);
      const day = header.createDiv({
        cls: `tasklane-plugin-chart-day ${weekendClass(date)}`,
        text: String(date.getDate()).padStart(2, '0')
      });
      day.style.gridColumn = `${index + 1}`;
      day.style.gridRow = '1';
    }

    for (const item of rows) {
      const row = grid.createDiv({ cls: item.type === 'group' ? 'tasklane-plugin-chart-group-row' : 'tasklane-plugin-chart-row' });
      for (let index = 0; index < timeline.days; index += 1) {
        const date = addDays(timeline.start, index);
        const cell = row.createDiv({ cls: `tasklane-plugin-chart-cell ${weekendClass(date)}` });
        cell.style.gridColumn = `${index + 1}`;
        cell.style.gridRow = '1';
      }
      if (item.type === 'group') {
        const groupRange = getGroupRange(item.tag, tasks);
        if (!groupRange) {
          continue;
        }
        const offset = Math.max(0, daysBetween(timeline.start, groupRange.start));
        const duration = Math.max(1, daysBetween(groupRange.start, groupRange.end) + 1);
        const bar = row.createDiv({ cls: 'tasklane-plugin-chart-group-bar' });
        bar.style.gridColumn = `${offset + 1} / span ${duration}`;
        bar.style.gridRow = '1';
        bar.title = `#${item.tag}`;
        continue;
      }

      const task = item.task;
      const offset = Math.max(0, daysBetween(timeline.start, task.start));
      const duration = Math.max(1, daysBetween(task.start, task.end) + 1);
      const bar = row.createDiv({ cls: `tasklane-plugin-chart-bar is-${task.status}` });
      bar.style.gridColumn = `${offset + 1} / span ${duration}`;
      bar.style.gridRow = '1';
      bar.title = task.name;
      bar.addEventListener('mousedown', (event) => this.startChartDrag(event, task, 'move'));
      bar.addEventListener('click', () => {
        if (this.suppressChartClick) {
          return;
        }
        this.plugin.openTask(task);
      });
      const leftHandle = bar.createDiv({ cls: 'tasklane-plugin-chart-handle is-left' });
      leftHandle.addEventListener('mousedown', (event) => this.startChartDrag(event, task, 'start'));
      const rightHandle = bar.createDiv({ cls: 'tasklane-plugin-chart-handle is-right' });
      rightHandle.addEventListener('mousedown', (event) => this.startChartDrag(event, task, 'end'));
      bar.createSpan({ text: task.name });
    }
  }

  private startChartDrag(event: MouseEvent, task: TasklaneTask, mode: ChartDragState['mode']) {
    event.preventDefault();
    event.stopPropagation();
    this.chartDrag = {
      task,
      mode,
      startClientX: event.clientX,
      originalStart: task.start,
      originalEnd: task.end,
      lastDiffDays: 0,
      moved: false
    };
    document.body.addClass('tasklane-plugin-dragging');
    window.addEventListener('mousemove', this.handleChartDragMove);
    window.addEventListener('mouseup', this.stopChartDrag);
  }

  private handleChartDragMove = (event: MouseEvent) => {
    const drag = this.chartDrag;
    if (!drag) {
      return;
    }
    const diffDays = Math.round((event.clientX - drag.startClientX) / 28);
    if (diffDays === drag.lastDiffDays) {
      return;
    }
    drag.lastDiffDays = diffDays;
    drag.moved = true;
  };

  private stopChartDrag = async () => {
    const drag = this.chartDrag;
    window.removeEventListener('mousemove', this.handleChartDragMove);
    window.removeEventListener('mouseup', this.stopChartDrag);
    document.body.removeClass('tasklane-plugin-dragging');
    if (!drag) {
      return;
    }
    this.chartDrag = null;

    if (!drag.moved || drag.lastDiffDays === 0) {
      await this.plugin.openTask(drag.task);
      return;
    }
    this.suppressChartClick = true;
    window.setTimeout(() => {
      this.suppressChartClick = false;
    }, 0);

    let nextStart = drag.originalStart;
    let nextEnd = drag.originalEnd;
    if (drag.mode === 'move') {
      nextStart = toDateKey(addDays(drag.originalStart, drag.lastDiffDays));
      nextEnd = toDateKey(addDays(drag.originalEnd, drag.lastDiffDays));
    } else if (drag.mode === 'start') {
      nextStart = toDateKey(addDays(drag.originalStart, drag.lastDiffDays));
      if (parseDateKey(nextStart) > parseDateKey(nextEnd)) {
        nextStart = nextEnd;
      }
    } else {
      nextEnd = toDateKey(addDays(drag.originalEnd, drag.lastDiffDays));
      if (parseDateKey(nextEnd) < parseDateKey(nextStart)) {
        nextEnd = nextStart;
      }
    }

    await this.plugin.updateTaskDates(drag.task, nextStart, nextEnd);
  };

  private syncVerticalScroll(list: HTMLElement, chart: HTMLElement) {
    const sync = (source: HTMLElement, target: HTMLElement) => {
      if (this.scrollLock) {
        return;
      }
      this.scrollLock = true;
      target.scrollTop = source.scrollTop;
      window.requestAnimationFrame(() => {
        this.scrollLock = false;
      });
    };

    list.addEventListener('scroll', () => sync(list, chart));
    chart.addEventListener('scroll', () => sync(chart, list));
  }
}

function parseDateKey(value: string): Date {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(input: Date | string, days: number): Date {
  const date = input instanceof Date ? new Date(input) : parseDateKey(input);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysBetween(start: Date | string, end: Date | string): number {
  const startDate = start instanceof Date ? start : parseDateKey(start);
  const endDate = end instanceof Date ? end : parseDateKey(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
}

function buildTimeline(tasks: TasklaneTask[]): { start: Date; days: number } {
  const starts = tasks.map((task) => parseDateKey(task.start).getTime());
  const ends = tasks.map((task) => parseDateKey(task.end).getTime());
  const start = addDays(new Date(Math.min(...starts)), -3);
  const end = addDays(new Date(Math.max(...ends)), 7);
  return {
    start,
    days: Math.max(14, daysBetween(start, end) + 1)
  };
}

function buildMonthSegments(timeline: { start: Date; days: number }): { start: number; days: number; label: string }[] {
  const segments: { start: number; days: number; label: string }[] = [];
  let index = 0;
  while (index < timeline.days) {
    const current = addDays(timeline.start, index);
    const year = current.getFullYear();
    const month = current.getMonth();
    let days = 1;
    while (index + days < timeline.days) {
      const next = addDays(timeline.start, index + days);
      if (next.getFullYear() !== year || next.getMonth() !== month) {
        break;
      }
      days += 1;
    }
    segments.push({
      start: index,
      days,
      label: `${year}/${String(month + 1).padStart(2, '0')}`
    });
    index += days;
  }
  return segments;
}

function updateTasklaneNoteDates(content: string, start: string, end: string): string {
  const normalized = String(content || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return normalized;
  }

  const boundary = normalized.indexOf('\n---\n', 4);
  if (boundary === -1) {
    return normalized;
  }

  let frontmatter = normalized.slice(4, boundary);
  frontmatter = upsertFrontmatterValue(frontmatter, 'start', start);
  frontmatter = upsertFrontmatterValue(frontmatter, 'end', end);
  return `---\n${frontmatter}\n---\n${normalized.slice(boundary + 5)}`;
}

function upsertFrontmatterValue(frontmatter: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}\\s*:.*$`, 'm');
  if (pattern.test(frontmatter)) {
    return frontmatter.replace(pattern, `${key}: ${value}`);
  }
  return `${frontmatter.trimEnd()}\n${key}: ${value}`;
}

function updateTasklaneLineDates(content: string, lineNumber: number | undefined, start: string, end: string): string {
  if (!lineNumber) {
    return content;
  }

  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const index = lineNumber - 1;
  if (!lines[index]) {
    return content;
  }

  let line = lines[index];
  line = upsertTaskLineDate(line, '🛫', start);
  line = upsertTaskLineDate(line, '📅', end);
  lines[index] = line;
  return lines.join('\n');
}

function upsertTaskLineDate(line: string, marker: string, value: string): string {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedMarker}\\s*\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}`, 'u');
  if (pattern.test(line)) {
    return line.replace(pattern, `${marker} ${value}`);
  }
  return `${line.trimEnd()} ${marker} ${value}`;
}

function buildGroupedRows(tasks: TasklaneTask[]): TasklaneRow[] {
  const nodeMap = new Map<string, { tag: string; children: Set<string>; tasks: TasklaneTask[] }>();
  const roots = new Set<string>();

  const ensureNode = (tag: string) => {
    if (!nodeMap.has(tag)) {
      nodeMap.set(tag, {
        tag,
        children: new Set(),
        tasks: []
      });
    }
    return nodeMap.get(tag)!;
  };

  for (const task of tasks) {
    const primaryTag = getPrimaryTag(task);
    if (primaryTag === 'NoTag') {
      ensureNode(primaryTag).tasks.push(task);
      roots.add(primaryTag);
      continue;
    }

    const parts = primaryTag.split('/').filter(Boolean);
    let parent = '';
    parts.forEach((part, index) => {
      const current = parent ? `${parent}/${part}` : part;
      ensureNode(current);
      if (index === 0) {
        roots.add(current);
      }
      if (parent) {
        ensureNode(parent).children.add(current);
      }
      parent = current;
    });
    ensureNode(primaryTag).tasks.push(task);
  }

  const rows: TasklaneRow[] = [];
  const collectTasks = (tag: string): TasklaneTask[] => {
    const node = nodeMap.get(tag);
    if (!node) {
      return [];
    }
    return [
      ...node.tasks,
      ...[...node.children].flatMap((childTag) => collectTasks(childTag))
    ];
  };

  const walk = (tag: string) => {
    const node = nodeMap.get(tag);
    if (!node) {
      return;
    }
    rows.push({
      type: 'group',
      tag,
      level: tag === 'NoTag' ? 0 : tag.split('/').length - 1,
      count: collectTasks(tag).length
    });

    const directTasks = [...node.tasks].sort(compareTasks);
    directTasks.forEach((task) => {
      rows.push({
        type: 'task',
        task,
        level: tag === 'NoTag' ? 0 : tag.split('/').length - 1
      });
    });

    [...node.children].sort(compareTags).forEach((childTag) => walk(childTag));
  };

  [...roots].sort(compareTags).forEach((tag) => walk(tag));
  return rows;
}

function getPrimaryTag(task: TasklaneTask): string {
  return getGroupingTags(task)[0] || 'NoTag';
}

function getGroupingTags(task: TasklaneTask): string[] {
  return task.tags
    .map((tag) => {
      if (tag === 'task') {
        return '';
      }
      if (tag.startsWith('task/')) {
        return tag.slice('task/'.length);
      }
      return tag;
    })
    .filter(Boolean);
}

function compareTags(a: string, b: string): number {
  if (a === 'NoTag') {
    return 1;
  }
  if (b === 'NoTag') {
    return -1;
  }
  return a.localeCompare(b);
}

function compareTasks(a: TasklaneTask, b: TasklaneTask): number {
  return a.end.localeCompare(b.end) || a.name.localeCompare(b.name);
}

function isTagMatch(tag: string, filterTag: string): boolean {
  return tag === filterTag || tag.startsWith(`${filterTag}/`);
}

function getGroupRange(tag: string, tasks: TasklaneTask[]): { start: string; end: string } | null {
  const groupTasks = tasks.filter((task) => {
    const primaryTag = getPrimaryTag(task);
    if (tag === 'NoTag') {
      return primaryTag === tag;
    }
    return isTagMatch(primaryTag, tag);
  });
  if (groupTasks.length === 0) {
    return null;
  }
  return {
    start: groupTasks.reduce((min, task) => (
      parseDateKey(task.start) < parseDateKey(min) ? task.start : min
    ), groupTasks[0].start),
    end: groupTasks.reduce((max, task) => (
      parseDateKey(task.end) > parseDateKey(max) ? task.end : max
    ), groupTasks[0].end)
  };
}

function weekendClass(date: Date): string {
  if (date.getDay() === 0) {
    return 'is-sunday';
  }
  if (date.getDay() === 6) {
    return 'is-saturday';
  }
  return '';
}

function formatTags(tags: string[]): string {
  return tags.length > 0 ? tags.map((tag) => `#${tag}`).join(' ') : '-';
}

function tagPalette(tag: string): { bg: string; border: string; text: string } {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) % 360;
  }
  const hue = hash;
  return {
    bg: `hsla(${hue}, 58%, 50%, 0.16)`,
    border: `hsla(${hue}, 58%, 46%, 0.46)`,
    text: `hsl(${hue}, 58%, 36%)`
  };
}
