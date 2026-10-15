import { NextResponse } from "next/server";
import { hasCloudConfig, updateTasks } from "@/lib/store";
import type { Task, TasksResponse } from "@/lib/tasks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function notFound(): NextResponse {
  return NextResponse.json({ error: "task not found" }, { status: 404 });
}

/**
 * PATCH /api/tasks/:id — update a task.
 * Body: { "text"?: "...", "completed"?: true|false }
 */
export async function PATCH(req: Request, ctx: Ctx) {
  if (!hasCloudConfig()) {
    return NextResponse.json<TasksResponse>({ source: "local", tasks: [] });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { text, completed } = body as Record<string, unknown>;

  const nextText =
    text !== undefined ? String(text).trim() : undefined;
  if (nextText !== undefined && nextText.length === 0) {
    return NextResponse.json({ error: "text cannot be empty" }, { status: 400 });
  }
  if (nextText !== undefined && nextText.length > 500) {
    return NextResponse.json({ error: "text too long (max 500 chars)" }, {
      status: 400,
    });
  }

  let found = false;
  const data = await updateTasks((tasks) =>
    tasks.map((t: Task) => {
      if (t.id !== id) return t;
      found = true;
      return {
        ...t,
        text: nextText ?? t.text,
        completed:
          completed !== undefined ? completed === true : t.completed,
      };
    }),
  );
  if (!found) return notFound();
  return NextResponse.json<TasksResponse>(data!);
}

/** DELETE /api/tasks/:id — remove a task. */
export async function DELETE(_req: Request, ctx: Ctx) {
  if (!hasCloudConfig()) {
    return NextResponse.json<TasksResponse>({ source: "local", tasks: [] });
  }
  const { id } = await ctx.params;

  let found = false;
  const data = await updateTasks((tasks) => {
    const next = tasks.filter((t) => t.id !== id);
    found = next.length !== tasks.length;
    return next;
  });
  if (!found) return notFound();
  return NextResponse.json<TasksResponse>(data!);
}
