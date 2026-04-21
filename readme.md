# Taskkanri Desktop (Electron + React)

A desktop task manager with a task list and interactive Gantt chart.

## Implemented requirements

- Easy task input from a quick-add form on the left panel.
- Left `1/3` task list and right `2/3` Gantt chart.
- Mouse operation on Gantt chart:
  - Drag task bar: move schedule.
  - Drag left/right handles: edit start/end date.
  - Double-click empty chart area: insert a task at that row/date.
- Dependency visibility:
  - Predecessor links: arrow lines.
  - Parent-child links: dotted guide lines.
- Zigzag progress line (Inazuma line):
  - Connects each task progress point across rows.

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

## Build renderer assets

```bash
npm run build
```

## Notes

- Task data is persisted with `localStorage` on the renderer side.
- If you need a production desktop package, the next step is adding `electron-builder` or `electron-forge`.
