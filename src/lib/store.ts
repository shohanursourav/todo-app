import { Redis } from "@upstash/redis";
import { isTask, type Task, type TasksResponse } from "./tasks";

/** Single shared key so every visitor/device shares the same list. */
export const TASKS_KEY = "todo:tasks";

let cachedClient: Redis | null | undefined;

/** True when both Upstash REST credentials are configured. */
export function hasCloudConfig(): boolean {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return Boolean(url && url.trim() && token && token.trim());
}

function getRedis(): Redis | null {
  if (cachedClient !== undefined) return cachedClient;
  cachedClient = hasCloudConfig() ? Redis.fromEnv() : null;
  return cachedClient;
}

function parseTasks(raw: unknown): Task[] {
  if (raw == null) return [];
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTask);
  } catch {
    return [];
  }
}

/**
 * Read the shared task list.
 * Returns `null` when no Upstash credentials are configured (local mode).
 */
export async function readTasks(): Promise<TasksResponse | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(TASKS_KEY);
  return { source: "cloud", tasks: parseTasks(raw) };
}

/**
 * Read-modify-write the shared task list.
 * Returns `null` when no Upstash credentials are configured (local mode).
 */
export async function updateTasks(
  mutate: (tasks: Task[]) => Task[],
): Promise<TasksResponse | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(TASKS_KEY);
  const next = mutate(parseTasks(raw));
  await redis.set(TASKS_KEY, JSON.stringify(next));
  return { source: "cloud", tasks: next };
}
