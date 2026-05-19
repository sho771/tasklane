var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// obsidian-plugin/src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TasklanePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// obsidian-plugin/src/tasklane.ts
var DEFAULT_SETTINGS = {
  taskFolder: "Tasklane",
  defaultTag: "task",
  fileNamePattern: "{date}_{name}"
};
var DAY_MS = 24 * 60 * 60 * 1e3;
function toDateKey(input) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function addDays(input, days) {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}
function createUid(input = /* @__PURE__ */ new Date()) {
  const date = new Date(input);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}${second}`;
}
function normalizeTag(rawTag) {
  const value = String(rawTag || "").trim().replace(/^#+/, "").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  return value;
}
function normalizeTags(rawTags) {
  if (Array.isArray(rawTags)) {
    return [...new Set(rawTags.map(normalizeTag).filter(Boolean))];
  }
  if (typeof rawTags === "string") {
    const parsed = rawTags.replace(/^\[|\]$/g, "").split(/[,\s]+/).map((tag) => tag.replace(/^["']|["']$/g, ""));
    return [...new Set(parsed.map(normalizeTag).filter(Boolean))];
  }
  return [];
}
function normalizeStatus(rawStatus, progress = 0) {
  const value = String(rawStatus || "").trim().toLowerCase();
  if (value === "todo" || value === "doing" || value === "done") {
    return value;
  }
  if (Number(progress) >= 100) {
    return "done";
  }
  if (Number(progress) > 0) {
    return "doing";
  }
  return "todo";
}
function clampProgress(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(parsed), 0), 100);
}
function parseDateFromText(text) {
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
function parseEmojiDate(text, marker) {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedMarker}\\s*(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})`, "u"));
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return toDateKey(date);
}
function splitFrontmatter(content) {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: "", body: normalized };
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: "", body: normalized };
  }
  return {
    frontmatter: normalized.slice(4, end),
    body: normalized.slice(end + 5)
  };
}
function parseMetaValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  if (raw === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  if (/^\[.*\]$/.test(raw)) {
    try {
      return JSON.parse(raw.replace(/'/g, '"'));
    } catch (e) {
      return raw;
    }
  }
  return raw.replace(/^["']|["']$/g, "");
}
function parseFrontmatter(frontmatter) {
  const meta = {};
  const lines = String(frontmatter || "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) {
      continue;
    }
    if (!value && index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
      const items = [];
      while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
        index += 1;
        items.push(lines[index].replace(/^\s+-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      }
      meta[key] = items;
      continue;
    }
    meta[key] = parseMetaValue(value);
  }
  return meta;
}
function firstHeading(body) {
  const match = String(body || "").match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}
function parseTasklaneNote(content, path) {
  var _a;
  const { frontmatter, body } = splitFrontmatter(content);
  const meta = parseFrontmatter(frontmatter);
  if (meta.tasklane !== true) {
    return null;
  }
  const progress = clampProgress(meta.progress);
  const fallbackName = ((_a = path.split("/").pop()) == null ? void 0 : _a.replace(/\.md$/i, "")) || "Untitled task";
  const name = String(meta.name || firstHeading(body) || fallbackName).trim();
  const start = typeof meta.start === "string" ? meta.start : toDateKey(/* @__PURE__ */ new Date());
  const end = typeof meta.end === "string" ? meta.end : start;
  return {
    id: `note:${path}`,
    kind: "note",
    name,
    path,
    status: normalizeStatus(meta.status, progress),
    start,
    end,
    progress,
    tags: normalizeTags(meta.tags)
  };
}
function parseTasklaneLine(lineText, path, lineNumber) {
  const match = String(lineText || "").match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.+)$/u);
  if (!match) {
    return null;
  }
  const body = match[2].trim();
  if (!/#task(?:\b|\/)/iu.test(body) || /#tasklane\/hidden\b/iu.test(body)) {
    return null;
  }
  const done = match[1].toLowerCase() === "x";
  const tags = normalizeTags((body.match(/#[^\s#,]+/gu) || []).map((tag) => tag.slice(1)));
  const fallbackDate = parseDateFromText(body);
  const startDate = parseEmojiDate(body, "\u{1F6EB}") || fallbackDate;
  const dueDate = parseEmojiDate(body, "\u{1F4C5}") || fallbackDate;
  const today = toDateKey(/* @__PURE__ */ new Date());
  const name = body.replace(/#[^\s#,]+/gu, " ").replace(/🛫\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}/gu, " ").replace(/📅\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}/gu, " ").replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/u, " ").replace(/\s+/g, " ").trim() || `Task from ${path}`;
  return {
    id: `line:${path}:${lineNumber}`,
    kind: "line",
    name,
    path,
    line: lineNumber,
    status: done ? "done" : "todo",
    start: startDate || dueDate || today,
    end: dueDate || startDate || toDateKey(addDays(today, 2)),
    progress: done ? 100 : 0,
    tags,
    rawLine: lineText
  };
}
function parseTasklaneLines(content, path) {
  return String(content || "").replace(/\r\n/g, "\n").split("\n").flatMap((line, index) => {
    const task = parseTasklaneLine(line, path, index + 1);
    return task ? [task] : [];
  });
}
function buildTaskNoteMarkdown(name, settings) {
  const today = toDateKey(/* @__PURE__ */ new Date());
  const end = toDateKey(addDays(today, 2));
  const tag = normalizeTag(settings.defaultTag) || DEFAULT_SETTINGS.defaultTag;
  return [
    "---",
    "tasklane: true",
    `uid: "${createUid()}"`,
    "status: todo",
    `start: ${today}`,
    `end: ${end}`,
    "progress: 0",
    "tags:",
    `  - ${tag}`,
    "dependsOn: []",
    "---",
    "",
    `# ${name}`,
    ""
  ].join("\n");
}
function sanitizeFileName(input) {
  return String(input || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "").slice(0, 80) || "task";
}
function buildTaskFileName(name, settings) {
  const safeName = sanitizeFileName(name);
  const date = toDateKey(/* @__PURE__ */ new Date()).replace(/-/g, "");
  const base = String(settings.fileNamePattern || DEFAULT_SETTINGS.fileNamePattern).replace(/\{date\}/g, date).replace(/\{name\}/g, safeName);
  return `${sanitizeFileName(base)}.md`;
}

// obsidian-plugin/src/main.ts
var VIEW_TYPE_TASKLANE = "tasklane-view";
var TasklanePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "settings", DEFAULT_SETTINGS);
    __publicField(this, "view", null);
    __publicField(this, "refreshTimer", null);
  }
  async onload() {
    await this.loadSettings();
    this.registerView(
      VIEW_TYPE_TASKLANE,
      (leaf) => {
        this.view = new TasklaneView(leaf, this);
        return this.view;
      }
    );
    this.addRibbonIcon("calendar-check", "Open Tasklane", () => {
      this.activateView();
    });
    this.addCommand({
      id: "open-tasklane-view",
      name: "Open Tasklane view",
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "create-tasklane-task-note",
      name: "Create Tasklane task note",
      callback: () => this.createTaskNote()
    });
    this.addCommand({
      id: "refresh-tasklane-tasks",
      name: "Refresh Tasklane tasks",
      callback: () => this.refreshView()
    });
    this.registerEvent(this.app.vault.on("create", (file) => this.scheduleRefreshIfMarkdown(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.scheduleRefreshIfMarkdown(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.scheduleRefreshIfMarkdown(file)));
    this.registerEvent(this.app.vault.on("rename", (file) => this.scheduleRefreshIfMarkdown(file)));
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
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_TASKLANE, active: true });
      this.app.workspace.revealLeaf(leaf);
      await this.refreshView();
    } catch (error) {
      console.error("Failed to open Tasklane view", error);
      new import_obsidian.Notice("Failed to open Tasklane view. Check the developer console for details.");
    }
  }
  async refreshView() {
    var _a;
    await ((_a = this.view) == null ? void 0 : _a.refresh());
  }
  async loadTasks() {
    const tasks = [];
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
  async openTask(task) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`Task file not found: ${task.path}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    if (task.kind === "line" && task.line) {
      const view = leaf.view;
      if (view instanceof import_obsidian.MarkdownView) {
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
    const name = "\u65B0\u898F\u30BF\u30B9\u30AF";
    const folder = this.settings.taskFolder.trim().replace(/^\/|\/$/g, "") || DEFAULT_SETTINGS.taskFolder;
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
    new import_obsidian.Notice(`Created Tasklane note: ${path}`);
    await this.refreshView();
  }
  async updateTaskDates(task, start, end) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`Task file not found: ${task.path}`);
      return;
    }
    const safeEnd = parseDateKey(end) < parseDateKey(start) ? start : end;
    const content = await this.app.vault.read(file);
    const nextContent = task.kind === "note" ? updateTasklaneNoteDates(content, start, safeEnd) : updateTasklaneLineDates(content, task.line, start, safeEnd);
    if (nextContent === content) {
      return;
    }
    await this.app.vault.modify(file, nextContent);
    task.start = start;
    task.end = safeEnd;
    await this.refreshView();
  }
  scheduleRefreshIfMarkdown(file) {
    if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") {
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
  async ensureFolder(folderPath) {
    const parts = folderPath.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
};
var TasklaneView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    __publicField(this, "plugin");
    __publicField(this, "tasks", []);
    __publicField(this, "statusFilter", "all");
    __publicField(this, "tagFilter", "all");
    __publicField(this, "scrollLock", false);
    __publicField(this, "chartDrag", null);
    __publicField(this, "suppressChartClick", false);
    __publicField(this, "handleChartDragMove", (event) => {
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
    });
    __publicField(this, "stopChartDrag", async () => {
      const drag = this.chartDrag;
      window.removeEventListener("mousemove", this.handleChartDragMove);
      window.removeEventListener("mouseup", this.stopChartDrag);
      document.body.removeClass("tasklane-plugin-dragging");
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
      if (drag.mode === "move") {
        nextStart = toDateKey(addDays2(drag.originalStart, drag.lastDiffDays));
        nextEnd = toDateKey(addDays2(drag.originalEnd, drag.lastDiffDays));
      } else if (drag.mode === "start") {
        nextStart = toDateKey(addDays2(drag.originalStart, drag.lastDiffDays));
        if (parseDateKey(nextStart) > parseDateKey(nextEnd)) {
          nextStart = nextEnd;
        }
      } else {
        nextEnd = toDateKey(addDays2(drag.originalEnd, drag.lastDiffDays));
        if (parseDateKey(nextEnd) < parseDateKey(nextStart)) {
          nextEnd = nextStart;
        }
      }
      await this.plugin.updateTaskDates(drag.task, nextStart, nextEnd);
    });
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_TASKLANE;
  }
  getDisplayText() {
    return "Tasklane";
  }
  getIcon() {
    return "calendar-check";
  }
  async onOpen() {
    await this.refresh();
  }
  async refresh() {
    this.tasks = await this.plugin.loadTasks();
    this.render();
  }
  render() {
    const container = this.contentEl;
    container.empty();
    container.addClass("tasklane-plugin-view");
    const visibleTasks = this.getVisibleTasks();
    const visibleRows = buildGroupedRows(visibleTasks);
    const toolbar = container.createDiv({ cls: "tasklane-plugin-toolbar" });
    toolbar.createEl("h2", { cls: "tasklane-plugin-title", text: "Tasklane" });
    toolbar.createSpan({ cls: "tasklane-plugin-status", text: `${visibleTasks.length} / ${this.tasks.length} tasks` });
    toolbar.createSpan({ cls: "tasklane-plugin-spacer" });
    const statusSelect = toolbar.createEl("select", { cls: "tasklane-plugin-filter" });
    [
      ["all", "All status"],
      ["todo", "Todo"],
      ["doing", "Doing"],
      ["done", "Done"]
    ].forEach(([value, label]) => {
      const option = statusSelect.createEl("option", { text: label });
      option.value = value;
      option.selected = this.statusFilter === value;
    });
    statusSelect.addEventListener("change", () => {
      this.statusFilter = statusSelect.value;
      this.render();
    });
    const tagSelect = toolbar.createEl("select", { cls: "tasklane-plugin-filter" });
    const allOption = tagSelect.createEl("option", { text: "All tags" });
    allOption.value = "all";
    allOption.selected = this.tagFilter === "all";
    for (const tag of this.getAllTags()) {
      const option = tagSelect.createEl("option", { text: `#${tag}` });
      option.value = tag;
      option.selected = this.tagFilter === tag;
    }
    tagSelect.addEventListener("change", () => {
      this.tagFilter = tagSelect.value;
      this.render();
    });
    const newButton = toolbar.createEl("button", { cls: "tasklane-plugin-button", text: "New Task" });
    newButton.addEventListener("click", () => this.plugin.createTaskNote());
    const refreshButton = toolbar.createEl("button", { cls: "tasklane-plugin-button", text: "Refresh" });
    refreshButton.addEventListener("click", () => this.refresh());
    if (this.tasks.length === 0) {
      const empty = container.createDiv({ cls: "tasklane-plugin-empty tasklane-plugin-empty-wide" });
      empty.setText("No tasklane:true notes or #task checklist lines found.");
      return;
    }
    if (visibleTasks.length === 0) {
      const empty = container.createDiv({ cls: "tasklane-plugin-empty tasklane-plugin-empty-wide" });
      empty.setText("No tasks match the current filters.");
      return;
    }
    const board = container.createDiv({ cls: "tasklane-plugin-board" });
    const list = board.createDiv({ cls: "tasklane-plugin-list" });
    const chart = board.createDiv({ cls: "tasklane-plugin-chart" });
    this.renderList(list, visibleRows);
    this.renderChart(chart, visibleRows, visibleTasks);
    this.syncVerticalScroll(list, chart);
  }
  getVisibleTasks() {
    return this.tasks.filter((task) => {
      if (this.statusFilter !== "all" && task.status !== this.statusFilter) {
        return false;
      }
      if (this.tagFilter !== "all" && !getGroupingTags(task).some((tag) => isTagMatch(tag, this.tagFilter))) {
        return false;
      }
      return true;
    });
  }
  getAllTags() {
    const tags = /* @__PURE__ */ new Set();
    for (const task of this.tasks) {
      getGroupingTags(task).forEach((tag) => tags.add(tag));
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }
  renderList(container, taskRows) {
    const header = container.createDiv({ cls: "tasklane-plugin-list-header" });
    header.createSpan({ text: "Task" });
    header.createSpan({ text: "Due" });
    header.createSpan({ text: "Status" });
    const rowContainer = container.createDiv({ cls: "tasklane-plugin-list-rows" });
    for (const item of taskRows) {
      if (item.type === "group") {
        const groupRow = rowContainer.createDiv({ cls: "tasklane-plugin-group-row" });
        groupRow.style.setProperty("--tasklane-indent", `${item.level * 16}px`);
        const palette = tagPalette(item.tag);
        const groupName = groupRow.createSpan({ cls: "tasklane-plugin-group-name" });
        groupName.style.setProperty("--tasklane-tag-bg", palette.bg);
        groupName.style.setProperty("--tasklane-tag-border", palette.border);
        groupName.style.setProperty("--tasklane-tag-text", palette.text);
        groupName.createSpan({ cls: "tasklane-plugin-tag-chip", text: `#${item.tag}` });
        groupRow.createSpan({ cls: "tasklane-plugin-group-count", text: `${item.count}` });
        continue;
      }
      const task = item.task;
      const row = rowContainer.createDiv({ cls: "tasklane-plugin-task" });
      row.style.setProperty("--tasklane-indent", `${item.level * 16}px`);
      row.title = task.name;
      const openButton = row.createEl("button", { cls: "tasklane-plugin-open" });
      openButton.addEventListener("click", () => this.plugin.openTask(task));
      openButton.createSpan({ cls: "tasklane-plugin-task-name", text: task.name });
      row.createSpan({ cls: "tasklane-plugin-task-meta", text: task.end });
      row.createSpan({ cls: "tasklane-plugin-task-meta", text: task.status });
    }
  }
  renderChart(container, rows, tasks) {
    if (tasks.length === 0) {
      return;
    }
    const timeline = buildTimeline(tasks);
    const grid = container.createDiv({ cls: "tasklane-plugin-chart-grid" });
    grid.style.setProperty("--tasklane-days", String(timeline.days));
    grid.style.setProperty("--tasklane-col-width", "28px");
    const monthHeader = grid.createDiv({ cls: "tasklane-plugin-chart-month-header" });
    for (const segment of buildMonthSegments(timeline)) {
      const month = monthHeader.createDiv({
        cls: "tasklane-plugin-chart-month",
        text: segment.label
      });
      month.style.gridColumn = `${segment.start + 1} / span ${segment.days}`;
      month.style.gridRow = "1";
    }
    const header = grid.createDiv({ cls: "tasklane-plugin-chart-header" });
    for (let index = 0; index < timeline.days; index += 1) {
      const date = addDays2(timeline.start, index);
      const day = header.createDiv({
        cls: `tasklane-plugin-chart-day ${weekendClass(date)}`,
        text: String(date.getDate()).padStart(2, "0")
      });
      day.style.gridColumn = `${index + 1}`;
      day.style.gridRow = "1";
    }
    for (const item of rows) {
      const row = grid.createDiv({ cls: item.type === "group" ? "tasklane-plugin-chart-group-row" : "tasklane-plugin-chart-row" });
      for (let index = 0; index < timeline.days; index += 1) {
        const date = addDays2(timeline.start, index);
        const cell = row.createDiv({ cls: `tasklane-plugin-chart-cell ${weekendClass(date)}` });
        cell.style.gridColumn = `${index + 1}`;
        cell.style.gridRow = "1";
      }
      if (item.type === "group") {
        const groupRange = getGroupRange(item.tag, tasks);
        if (!groupRange) {
          continue;
        }
        const offset2 = Math.max(0, daysBetween(timeline.start, groupRange.start));
        const duration2 = Math.max(1, daysBetween(groupRange.start, groupRange.end) + 1);
        const bar2 = row.createDiv({ cls: "tasklane-plugin-chart-group-bar" });
        bar2.style.gridColumn = `${offset2 + 1} / span ${duration2}`;
        bar2.style.gridRow = "1";
        bar2.title = `#${item.tag}`;
        continue;
      }
      const task = item.task;
      const offset = Math.max(0, daysBetween(timeline.start, task.start));
      const duration = Math.max(1, daysBetween(task.start, task.end) + 1);
      const bar = row.createDiv({ cls: `tasklane-plugin-chart-bar is-${task.status}` });
      bar.style.gridColumn = `${offset + 1} / span ${duration}`;
      bar.style.gridRow = "1";
      bar.title = task.name;
      bar.addEventListener("mousedown", (event) => this.startChartDrag(event, task, "move"));
      bar.addEventListener("click", () => {
        if (this.suppressChartClick) {
          return;
        }
        this.plugin.openTask(task);
      });
      const leftHandle = bar.createDiv({ cls: "tasklane-plugin-chart-handle is-left" });
      leftHandle.addEventListener("mousedown", (event) => this.startChartDrag(event, task, "start"));
      const rightHandle = bar.createDiv({ cls: "tasklane-plugin-chart-handle is-right" });
      rightHandle.addEventListener("mousedown", (event) => this.startChartDrag(event, task, "end"));
      bar.createSpan({ text: task.name });
    }
  }
  startChartDrag(event, task, mode) {
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
    document.body.addClass("tasklane-plugin-dragging");
    window.addEventListener("mousemove", this.handleChartDragMove);
    window.addEventListener("mouseup", this.stopChartDrag);
  }
  syncVerticalScroll(list, chart) {
    const sync = (source, target) => {
      if (this.scrollLock) {
        return;
      }
      this.scrollLock = true;
      target.scrollTop = source.scrollTop;
      window.requestAnimationFrame(() => {
        this.scrollLock = false;
      });
    };
    list.addEventListener("scroll", () => sync(list, chart));
    chart.addEventListener("scroll", () => sync(chart, list));
  }
};
function parseDateKey(value) {
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays2(input, days) {
  const date = input instanceof Date ? new Date(input) : parseDateKey(input);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}
function daysBetween(start, end) {
  const startDate = start instanceof Date ? start : parseDateKey(start);
  const endDate = end instanceof Date ? end : parseDateKey(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1e3));
}
function buildTimeline(tasks) {
  const starts = tasks.map((task) => parseDateKey(task.start).getTime());
  const ends = tasks.map((task) => parseDateKey(task.end).getTime());
  const start = addDays2(new Date(Math.min(...starts)), -3);
  const end = addDays2(new Date(Math.max(...ends)), 7);
  return {
    start,
    days: Math.max(14, daysBetween(start, end) + 1)
  };
}
function buildMonthSegments(timeline) {
  const segments = [];
  let index = 0;
  while (index < timeline.days) {
    const current = addDays2(timeline.start, index);
    const year = current.getFullYear();
    const month = current.getMonth();
    let days = 1;
    while (index + days < timeline.days) {
      const next = addDays2(timeline.start, index + days);
      if (next.getFullYear() !== year || next.getMonth() !== month) {
        break;
      }
      days += 1;
    }
    segments.push({
      start: index,
      days,
      label: `${year}/${String(month + 1).padStart(2, "0")}`
    });
    index += days;
  }
  return segments;
}
function updateTasklaneNoteDates(content, start, end) {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return normalized;
  }
  const boundary = normalized.indexOf("\n---\n", 4);
  if (boundary === -1) {
    return normalized;
  }
  let frontmatter = normalized.slice(4, boundary);
  frontmatter = upsertFrontmatterValue(frontmatter, "start", start);
  frontmatter = upsertFrontmatterValue(frontmatter, "end", end);
  return `---
${frontmatter}
---
${normalized.slice(boundary + 5)}`;
}
function upsertFrontmatterValue(frontmatter, key, value) {
  const pattern = new RegExp(`^${key}\\s*:.*$`, "m");
  if (pattern.test(frontmatter)) {
    return frontmatter.replace(pattern, `${key}: ${value}`);
  }
  return `${frontmatter.trimEnd()}
${key}: ${value}`;
}
function updateTasklaneLineDates(content, lineNumber, start, end) {
  if (!lineNumber) {
    return content;
  }
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const index = lineNumber - 1;
  if (!lines[index]) {
    return content;
  }
  let line = lines[index];
  line = upsertTaskLineDate(line, "\u{1F6EB}", start);
  line = upsertTaskLineDate(line, "\u{1F4C5}", end);
  lines[index] = line;
  return lines.join("\n");
}
function upsertTaskLineDate(line, marker, value) {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedMarker}\\s*\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}`, "u");
  if (pattern.test(line)) {
    return line.replace(pattern, `${marker} ${value}`);
  }
  return `${line.trimEnd()} ${marker} ${value}`;
}
function buildGroupedRows(tasks) {
  const nodeMap = /* @__PURE__ */ new Map();
  const roots = /* @__PURE__ */ new Set();
  const ensureNode = (tag) => {
    if (!nodeMap.has(tag)) {
      nodeMap.set(tag, {
        tag,
        children: /* @__PURE__ */ new Set(),
        tasks: []
      });
    }
    return nodeMap.get(tag);
  };
  for (const task of tasks) {
    const primaryTag = getPrimaryTag(task);
    if (primaryTag === "NoTag") {
      ensureNode(primaryTag).tasks.push(task);
      roots.add(primaryTag);
      continue;
    }
    const parts = primaryTag.split("/").filter(Boolean);
    let parent = "";
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
  const rows = [];
  const collectTasks = (tag) => {
    const node = nodeMap.get(tag);
    if (!node) {
      return [];
    }
    return [
      ...node.tasks,
      ...[...node.children].flatMap((childTag) => collectTasks(childTag))
    ];
  };
  const walk = (tag) => {
    const node = nodeMap.get(tag);
    if (!node) {
      return;
    }
    rows.push({
      type: "group",
      tag,
      level: tag === "NoTag" ? 0 : tag.split("/").length - 1,
      count: collectTasks(tag).length
    });
    const directTasks = [...node.tasks].sort(compareTasks);
    directTasks.forEach((task) => {
      rows.push({
        type: "task",
        task,
        level: tag === "NoTag" ? 0 : tag.split("/").length - 1
      });
    });
    [...node.children].sort(compareTags).forEach((childTag) => walk(childTag));
  };
  [...roots].sort(compareTags).forEach((tag) => walk(tag));
  return rows;
}
function getPrimaryTag(task) {
  return getGroupingTags(task)[0] || "NoTag";
}
function getGroupingTags(task) {
  return task.tags.map((tag) => {
    if (tag === "task") {
      return "";
    }
    if (tag.startsWith("task/")) {
      return tag.slice("task/".length);
    }
    return tag;
  }).filter(Boolean);
}
function compareTags(a, b) {
  if (a === "NoTag") {
    return 1;
  }
  if (b === "NoTag") {
    return -1;
  }
  return a.localeCompare(b);
}
function compareTasks(a, b) {
  return a.end.localeCompare(b.end) || a.name.localeCompare(b.name);
}
function isTagMatch(tag, filterTag) {
  return tag === filterTag || tag.startsWith(`${filterTag}/`);
}
function getGroupRange(tag, tasks) {
  const groupTasks = tasks.filter((task) => {
    const primaryTag = getPrimaryTag(task);
    if (tag === "NoTag") {
      return primaryTag === tag;
    }
    return isTagMatch(primaryTag, tag);
  });
  if (groupTasks.length === 0) {
    return null;
  }
  return {
    start: groupTasks.reduce((min, task) => parseDateKey(task.start) < parseDateKey(min) ? task.start : min, groupTasks[0].start),
    end: groupTasks.reduce((max, task) => parseDateKey(task.end) > parseDateKey(max) ? task.end : max, groupTasks[0].end)
  };
}
function weekendClass(date) {
  if (date.getDay() === 0) {
    return "is-sunday";
  }
  if (date.getDay() === 6) {
    return "is-saturday";
  }
  return "";
}
function tagPalette(tag) {
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
