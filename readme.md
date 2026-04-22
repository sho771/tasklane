# Taskkanri Desktop (Electron + React)

A desktop task manager with a task list and interactive Gantt chart.

## Implemented requirements

- Easy task input from the `Task Add` button on the left panel.
- Left `1/3` task list and right `2/3` Gantt chart.
- Drag the vertical boundary to resize left/right panel width.
- Left form area remains visible in windowed mode (task list scrolls independently).
- Left task rows and right Gantt rows keep aligned heights.
- `Task Add` button on the left header adds a new task quickly.
- Obsidian vault integration:
  - Actions are grouped under the `⋮` menu (except `Task Add`).
  - `Vault`: select vault folder.
  - `Vault Off`: disconnect current vault path.
  - `Export`: save each task as markdown under `Taskkanri/`.
  - `Import Tag`: import markdown notes tagged with `#task` from vault into tasks.
  - `Import File`: import tasks from one selected markdown file.
  - After vault selection, task edits are auto-saved to markdown (debounced).
  - `Clear Tasks`: delete all tasks in one action.
- Mouse operation on Gantt chart:
  - Drag task bar: move schedule.
  - Drag left/right handles: edit start/end date.
  - Double-click empty chart area: insert a task at that row/date.
- Dependency visibility:
  - Predecessor links: arrow lines.
  - Parent-child links: dotted guide lines.
- Zigzag progress line (Inazuma line):
  - Connects each task progress point across rows.
- Click task name / task No to open modal and edit a single Notes field with in-place Markdown live rendering.
- Modal supports `tags` property input (for example `#task #work`).
- Task `UID` is auto-generated on `Task Add` in `YYYYMMDDHHmmss` format.
- Tasks can be grouped with the `group` field and are displayed grouped by that value.
- Today's date is highlighted on the timeline header (no vertical `TODAY` label line on the chart).

## Tech stack

- Electron
- React (Vite)
- Plain SVG overlays for dependency/progress lines

## Run

```bash
npm install
npm run dev
```

- Vite dev server starts on `http://127.0.0.1:5173`.
- Electron launches automatically and loads the React app.

## Build

```bash
npm run build
```

## Start desktop app from built files

```bash
npm run start
```

## Notes

- Task data is persisted with `localStorage` on the renderer side.
- Vault sync is bidirectional through markdown files (`Import` / `Export` + auto-save on task edits).
- Obsidian line task format supported: `- [ ] <task name> #task <due date>`.
- Markdown import decoding supports UTF-8 and common Japanese encodings (Shift_JIS/EUC-JP/ISO-2022-JP fallback).
- If you need a production desktop package, the next step is adding `electron-builder` or `electron-forge`.
