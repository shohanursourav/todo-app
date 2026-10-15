export type Task = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
};

/** Where the task list is being persisted. */
export type Source = "cloud" | "local";

export type TasksResponse = {
  source: Source;
  tasks: Task[];
};

export function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    typeof v.completed === "boolean" &&
    typeof v.createdAt === "number"
  );
}
