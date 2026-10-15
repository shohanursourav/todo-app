"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTask, type Source, type Task, type TasksResponse } from "@/lib/tasks";

const STORAGE_KEY = "todo:tasks";
const REFRESH_INTERVAL_MS = 5000;

type Filter = "all" | "active" | "completed";
type Mode = "loading" | Source;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];

function readLocalTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.filter(isTask) as Task[]) : [];
  } catch {
    return [];
  }
}

function writeLocalTasks(tasks: Task[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // storage full/unavailable — ignore
  }
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<Mode>("loading");
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Apply a fetched task list, picking cloud vs local from the `source` flag. */
  const applyFetched = useCallback((data: TasksResponse) => {
    if (data.source === "cloud" && Array.isArray(data.tasks)) {
      setMode("cloud");
      setTasks(data.tasks.filter(isTask));
    } else {
      setMode("local");
      setTasks(readLocalTasks());
    }
  }, []);

  /** Pull the authoritative task list (API in cloud mode, localStorage in local mode). */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      applyFetched((await res.json()) as TasksResponse);
    } catch {
      // No network / server unavailable → fall back to local storage.
      setMode("local");
      setTasks(readLocalTasks());
    } finally {
      setHydrated(true);
    }
  }, [applyFetched]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tasks", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!cancelled) applyFetched((await res.json()) as TasksResponse);
      } catch {
        if (!cancelled) {
          // No network / server unavailable → fall back to local storage.
          setMode("local");
          setTasks(readLocalTasks());
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFetched]);

  // Auto-refresh every 5 seconds.
  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(() => {
      if (mode === "cloud") void refresh();
      else setTasks(readLocalTasks());
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hydrated, mode, refresh]);

  // Cross-tab sync in local mode.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setTasks(readLocalTasks());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  /** Apply a mutation optimistically, then sync with the backend (cloud) or localStorage (local). */
  const mutate = useCallback(
    async (
      localNext: (current: Task[]) => Task[],
      api: () => Promise<Response>,
    ) => {
      const previous = tasks;
      const next = localNext(previous);
      setTasks(next);

      if (mode === "local" || mode === "loading") {
        writeLocalTasks(next);
        return;
      }

      try {
        const res = await api();
        if (res.ok) {
          const data = (await res.json()) as TasksResponse;
          if (Array.isArray(data.tasks)) {
            setTasks(data.tasks.filter(isTask));
            return;
          }
        }
        // Unexpected response → resync from the source of truth.
        await refresh();
      } catch {
        setTasks(previous); // optimistic rollback; next poll resyncs
      }
    },
    [tasks, mode, refresh],
  );

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !hydrated) return;
    const task: Task = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: Date.now(),
    };
    setDraft("");
    void mutate(
      (current) => [task, ...current],
      () =>
        fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }),
    );
  };

  const toggleTask = (task: Task) => {
    const completed = !task.completed;
    void mutate(
      (current) =>
        current.map((t) => (t.id === task.id ? { ...t, completed } : t)),
      () =>
        fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed }),
        }),
    );
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditText(task.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = (task: Task) => {
    const text = editText.trim();
    setEditingId(null);
    if (!text || text === task.text) {
      setEditText("");
      return;
    }
    void mutate(
      (current) =>
        current.map((t) => (t.id === task.id ? { ...t, text } : t)),
      () =>
        fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }),
    );
  };

  const deleteTask = (task: Task) => {
    void mutate(
      (current) => current.filter((t) => t.id !== task.id),
      () => fetch(`/api/tasks/${task.id}`, { method: "DELETE" }),
    );
  };

  const clearCompleted = () => {
    void mutate(
      (current) => current.filter((t) => !t.completed),
      () => fetch("/api/tasks/clear", { method: "POST" }),
    );
  };

  const share = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) → legacy fallback.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        ta.remove();
      }
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const visible = useMemo(() => {
    if (filter === "active") return tasks.filter((t) => !t.completed);
    if (filter === "completed") return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  const activeCount = useMemo(
    () => tasks.filter((t) => !t.completed).length,
    [tasks],
  );
  const completedCount = tasks.length - activeCount;

  const badge =
    mode === "cloud"
      ? {
          dot: "bg-emerald-500",
          classes:
            "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
          label: "Cloud",
        }
      : mode === "local"
        ? {
            dot: "bg-amber-500",
            classes:
              "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
            label: "Local",
          }
        : {
            dot: "bg-zinc-400",
            classes:
              "bg-zinc-100 text-zinc-500 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-400/20",
            label: "…",
          };

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-b from-indigo-50 via-white to-white px-4 py-8 font-sans text-zinc-900 sm:items-center sm:py-12 dark:from-zinc-950 dark:via-zinc-950 dark:to-black dark:text-zinc-100">
      <main className="w-full max-w-xl">
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10">
          {/* Header */}
          <header className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">Shared To-Do</h1>
              <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
                {mode === "cloud" &&
                  "Synced and auto-refreshes every 5s"}
                {mode === "local" &&
                  "Stored in this browser only · add Upstash keys for cloud sync"}
                {mode === "loading" && "Connecting…"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badge.classes}`}
                title={
                  mode === "cloud"
                    ? "Tasks are persisted in Upstash Redis"
                    : "Tasks are persisted in localStorage"
                }
              >
                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                {badge.label}
              </span>
              <button
                type="button"
                onClick={share}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors ${
                  copied
                    ? "bg-emerald-600 text-white hover:bg-emerald-600"
                    : "bg-indigo-600 text-white hover:bg-indigo-500"
                }`}
              >
                {copied ? (
                  <>
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 13l4 4L19 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.257 1.757a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364l1.757 1.757"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Share
                  </>
                )}
              </button>
            </div>
          </header>

          {/* Add task */}
          <form onSubmit={addTask} className="px-6 pb-4">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What needs to be done?"
                aria-label="New task"
                maxLength={500}
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!draft.trim() || mode === "loading"}
                className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </form>

          {/* Task list */}
          {visible.length === 0 ? (
            <p className="border-t border-zinc-100 px-6 py-10 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
              {filter === "completed"
                ? "Nothing completed yet."
                : filter === "active"
                  ? "No active tasks — nice work! 🎉"
                  : "Nothing here yet. Add your first task above."}
            </p>
          ) : (
            <ul className="max-h-[50vh] overflow-y-auto border-t border-zinc-100 dark:border-zinc-800">
              {visible.map((task) => {
                const isEditing = editingId === task.id;
                return (
                  <li
                    key={task.id}
                    className="group flex items-center gap-3 px-6 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task)}
                      aria-label={
                        task.completed
                          ? `Mark "${task.text}" as not done`
                          : `Mark "${task.text}" as done`
                      }
                      className="h-5 w-5 shrink-0 cursor-pointer rounded accent-indigo-600"
                    />
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={() => saveEdit(task)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(task);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        maxLength={500}
                        aria-label="Edit task"
                        className="min-w-0 flex-1 rounded-md border border-indigo-300 bg-white px-2 py-1 text-sm outline-none ring-2 ring-indigo-500/20 dark:border-indigo-500 dark:bg-zinc-800"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => startEdit(task)}
                        title="Double-click to edit"
                        className={`min-w-0 flex-1 cursor-text select-none break-words text-sm ${
                          task.completed
                            ? "text-zinc-400 line-through dark:text-zinc-500"
                            : ""
                        }`}
                      >
                        {task.text}
                      </span>
                    )}
                    {isEditing ? (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => saveEdit(task)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(task)}
                          aria-label={`Edit "${task.text}"`}
                          className="rounded-md p-1.5 text-zinc-400 transition-opacity hover:bg-zinc-100 hover:text-zinc-600 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        >
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <path
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task)}
                          aria-label={`Delete "${task.text}"`}
                          className="rounded-md p-1.5 text-zinc-400 transition-opacity hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        >
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <path
                              d="M6 18L18 6M6 6l12 12"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Footer */}
          <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-zinc-100 bg-zinc-50/60 px-6 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
            <span className="tabular-nums">
              {activeCount} item{activeCount === 1 ? "" : "s"} left
            </span>
            <div
              className="flex gap-1 rounded-lg bg-zinc-200/70 p-0.5 dark:bg-zinc-800"
              role="tablist"
              aria-label="Filter tasks"
            >
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  role="tab"
                  aria-selected={filter === key}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    filter === key
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={clearCompleted}
              disabled={completedCount === 0}
              className="text-xs font-semibold text-zinc-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:text-red-400"
            >
              Clear completed
            </button>
          </footer>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          One shared list for everyone · double-click a task to edit ·{" "}
          {mode === "cloud"
            ? "Share the link and the whole list follows"
            : "data stays in this browser until Upstash keys are set"}
        </p>
      </main>
    </div>
  );
}
