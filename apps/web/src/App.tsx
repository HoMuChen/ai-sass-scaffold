import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api.js";

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.$get();
      if (!res.ok) throw new Error("health probe failed");
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container mx-auto flex max-w-3xl flex-col gap-6 py-16">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">ai-sass-scaffold</h1>
          <p className="text-muted-foreground">
            Monorepo boilerplate — Hono API, BullMQ worker, Drizzle + pgvector,
            Better Auth, OpenRouter, shadcn/ui.
          </p>
        </header>

        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-medium">API health</h2>
          <pre className="mt-3 rounded bg-muted p-3 text-sm">
            {health.isLoading
              ? "loading..."
              : health.isError
                ? String(health.error)
                : JSON.stringify(health.data, null, 2)}
          </pre>
        </section>
      </main>
    </div>
  );
}
