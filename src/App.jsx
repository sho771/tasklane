import { useEffect, useMemo, useRef, useState } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 78;
const COL_WIDTH = 36;
const STORAGE_KEY = 'taskkanri.desktop.v1';

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
      dependsOn: []
    },
    {
      id: 2,
      name: 'UI Draft',
      start: toDateKey(addDays(today, 0)),
      end: toDateKey(addDays(today, 5)),
      progress: 50,
      parentId: 1,
      dependsOn: [1]
    },
    {
      id: 3,
      name: 'Integration',
      start: toDateKey(addDays(today, 6)),
      end: toDateKey(addDays(today, 11)),
      progress: 15,
      parentId: 1,
      dependsOn: [2]
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

  return {
    id,
    name: typeof rawTask.name === 'string' && rawTask.name.trim() ? rawTask.name : `Task ${id}`,
    start,
    end: safeEnd,
    progress,
    parentId: Number.isInteger(parentId) && parentId > 0 && parentId !== id ? parentId : null,
    dependsOn
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

function App() {
  const [tasks, setTasks] = useState(() => loadInitialTasks());
  const [quickName, setQuickName] = useState('');
  const [quickStart, setQuickStart] = useState(() => toDateKey(new Date()));
  const [quickDuration, setQuickDuration] = useState(3);

  const idRef = useRef(tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1);
  const headerScrollRef = useRef(null);
  const listScrollRef = useRef(null);
  const chartScrollRef = useRef(null);
  const chartCanvasRef = useRef(null);
  const syncLockRef = useRef(false);
  const dragRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const timeline = useMemo(() => {
    if (tasks.length === 0) {
      const today = startOfDay(new Date());
      const start = addDays(today, -7);
      const end = addDays(today, 21);
      const days = daysBetween(start, end) + 1;
      return {
        start: toDateKey(start),
        end: toDateKey(end),
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
      end: toDateKey(end),
      days,
      width: days * COL_WIDTH
    };
  }, [tasks]);

  const chartHeight = Math.max(tasks.length * ROW_HEIGHT, ROW_HEIGHT * 2);

  const geometry = useMemo(() => {
    const positions = new Map();
    tasks.forEach((task, index) => {
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
  }, [tasks, timeline.start]);

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

  const handleQuickAdd = (event) => {
    event.preventDefault();
    if (!quickName.trim()) {
      return;
    }

    const duration = Math.max(1, Number(quickDuration) || 1);
    const start = quickStart;
    const end = toDateKey(addDays(start, duration - 1));

    addTaskAt({
      name: quickName.trim(),
      start,
      end,
      progress: 0,
      parentId: null,
      dependsOn: []
    });

    setQuickName('');
  };

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

  useEffect(() => () => {
    window.removeEventListener('mousemove', handleDragging);
    window.removeEventListener('mouseup', stopDrag);
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
    const row = clamp(Math.floor(y / ROW_HEIGHT), 0, tasks.length);
    const start = toDateKey(addDays(timeline.start, dayOffset));
    const end = toDateKey(addDays(start, 2));

    addTaskAt({
      name: `Task ${idRef.current}`,
      start,
      end,
      progress: 0,
      parentId: null,
      dependsOn: []
    }, row);
  };

  const relationPaths = useMemo(() => {
    const dependencies = [];
    const parents = [];

    tasks.forEach((task) => {
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
  }, [geometry, tasks]);

  const progressPolyline = useMemo(() => {
    const points = tasks
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
  }, [geometry, tasks]);

  const today = toDateKey(new Date());
  const todayOffset = daysBetween(timeline.start, today);
  const showTodayLine = todayOffset >= 0 && todayOffset <= timeline.days;

  const validParentOptions = (taskId) => tasks.filter((candidate) => candidate.id !== taskId);

  return (
    <div className="desktop-root">
      <div className="split-layout">
        <aside className="task-panel">
          <div className="panel-top">
            <h1>Taskkanri Desktop</h1>
            <p>Quick input on the left, direct date edits on the chart.</p>
            <form className="quick-form" onSubmit={handleQuickAdd}>
              <input
                type="text"
                placeholder="Task name"
                value={quickName}
                onChange={(event) => setQuickName(event.target.value)}
              />
              <div className="quick-form-sub">
                <input
                  type="date"
                  value={quickStart}
                  onChange={(event) => setQuickStart(event.target.value)}
                />
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={quickDuration}
                  onChange={(event) => setQuickDuration(Number(event.target.value))}
                />
                <button type="submit">Add</button>
              </div>
            </form>
          </div>

          <div className="task-scroll" ref={listScrollRef}>
            {tasks.map((task) => (
              <div className="task-row" style={{ height: `${ROW_HEIGHT}px` }} key={task.id}>
                <div className="task-title-line">
                  <span className="task-id">#{task.id}</span>
                  <input
                    type="text"
                    value={task.name}
                    onChange={(event) => updateTask(task.id, { name: event.target.value })}
                  />
                  <button
                    type="button"
                    className="delete-btn"
                    onClick={() => removeTask(task.id)}
                    aria-label={`Delete task ${task.id}`}
                  >
                    x
                  </button>
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
                      <option value={option.id} key={option.id}>#{option.id}</option>
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
        </aside>

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

                return (
                  <div className={`time-cell ${isWeekend ? 'weekend' : ''}`} key={key}>
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
              {tasks.map((task, index) => {
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

              {showTodayLine && (
                <div
                  className="today-line"
                  style={{ left: `${todayOffset * COL_WIDTH}px` }}
                >
                  <span>TODAY</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
