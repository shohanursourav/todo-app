import { NextResponse } from "next/server";
import { hasCloudConfig, updateTasks } from "@/lib/store";
import type { Task, TasksResponse } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** POST /api/tasks/clear — remove every completed task. */
export async function POST() {
  if (!hasCloudConfig()) {
    return NextResponse.json<TasksResponse>({ source: "local", tasks: [] });
  }
  const data = await updateTasks((tasks) => tasks.filter((t) => !t.completed));
  return NextResponse.json<TasksResponse>(data ?? {
    source: "cloud",
    tasks: [] as Task[],
  });
}
