import { NextResponse } from "next/server";
import { hasCloudConfig, readTasks, updateTasks } from "@/lib/store";
import type { Task, TasksResponse } from "@/lib/tasks";

// Always read fresh data; never prerender or cache these responses.
export const dynamic = "force-dynamic";

/** Local-mode placeholder: the browser's localStorage is the source of truth. */
function localResponse(tasks: Task[] = []): NextResponse {
  return NextResponse.json<TasksResponse>({ source: "local", tasks });
}

/** GET /api/tasks — list all tasks and where they are stored. */
export async function GET() {
  if (!hasCloudConfig()) return localResponse();
  const data = await readTasks();
  return NextResponse.json<TasksResponse>(data ?? { source: "cloud", tasks: [] });
}

/** POST /api/tasks — add a task. Body: { "text": "..." } */
export async function POST(req: Request) {
  if (!hasCloudConfig()) return localResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  const text =
    typeof body === "object" && body !== null
      ? String((body as Record<string, unknown>).text ?? "").trim()
      : "";
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ error: "text too long (max 500 chars)" }, { status: 400 });
  }

  const task: Task = {
    id: crypto.randomUUID(),
    text,
    completed: false,
    createdAt: Date.now(),
  };

  const data = await updateTasks((tasks) => [task, ...tasks]);
  return NextResponse.json<TasksResponse>(data ?? { source: "cloud", tasks: [task] }, {
    status: 201,
  });
}
