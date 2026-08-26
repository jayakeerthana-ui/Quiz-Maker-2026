---
name: ai-sdk
description: Add or modify AI model calls using the Vercel AI SDK on Cloudflare Workers. Use when the task involves calling an LLM, generating structured output, streaming a chat response, or wiring an API key for an AI provider.
---

# Vercel AI SDK on Cloudflare Workers

The AI SDK is **not installed in this starter**. Install it the first time it is needed.

```bash
npm install ai @ai-sdk/openai @ai-sdk/react zod
```

The `ai` package is on v7. Two constraints that break older examples found online:
v7 requires Node 22 or later, and it is ESM-only. Next.js app code already uses ESM,
so this only matters for standalone scripts.

## Reading the API key

This app runs on Cloudflare Workers, where `process.env` is not populated the way it is
in Node. Do not rely on the default provider instance picking up `OPENAI_API_KEY`.

Read the key from the Workers environment and construct the provider explicitly:

```ts
import { createOpenAI } from "@ai-sdk/openai";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getOpenAI() {
  const { env } = await getCloudflareContext({ async: true });
  return createOpenAI({ apiKey: env.OPENAI_API_KEY });
}
```

Set the key locally in `.dev.vars`, and in production with
`npx wrangler secret put OPENAI_API_KEY`. Add it to `.dev.vars.example` as an empty
placeholder so the requirement is discoverable. Never hard-code a key.

## Structured output

Prefer structured output over free text whenever the result feeds application logic.

In v7, `generateObject` is deprecated. Use `generateText` with an `Output` specification.

Define the schema in its own file so the server and client share one definition:

```ts
// src/lib/schemas/recipe.ts
import { z } from "zod";

export const RecipeSchema = z.object({
  title: z.string().describe("The title of the recipe."),
  prepTimeMinutes: z.number().describe("Preparation time in minutes."),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()).describe("Step-by-step instructions."),
});

export type Recipe = z.infer<typeof RecipeSchema>;
```

The `.describe()` calls are passed to the model and measurably improve output quality.

Generate it in a route handler:

```ts
// src/app/api/recipe/route.ts
import { generateText, Output } from "ai";
import { getOpenAI } from "@/lib/ai";
import { RecipeSchema } from "@/lib/schemas/recipe";

export async function POST(req: Request) {
  const { topic } = await req.json();

  if (typeof topic !== "string" || topic.trim() === "") {
    return Response.json({ error: "topic is required" }, { status: 400 });
  }

  const openai = await getOpenAI();

  const { output } = await generateText({
    model: openai(MODEL_ID), // see "Model selection" below
    output: Output.object({ schema: RecipeSchema }),
    prompt: `Generate a simple recipe for: ${topic}`,
  });

  return Response.json(output);
}
```

The result is on `output`, not `object`. The other specifications are
`Output.array({ element })`, `Output.choice({ options })`, `Output.json()`, and
`Output.text()`.

## Consuming on the client

Re-use the same schema to validate what comes back:

```tsx
"use client";

import { useState } from "react";
import { RecipeSchema, type Recipe } from "@/lib/schemas/recipe";

export function RecipeGenerator() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(topic: string) {
    const res = await fetch("/api/recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });

    if (!res.ok) {
      setError("Request failed");
      return;
    }

    const parsed = RecipeSchema.safeParse(await res.json());
    if (!parsed.success) {
      // Zod 4 exposes `issues`. `error.errors` was the Zod 3 name and is gone.
      setError(parsed.error.issues.map((i) => i.message).join(", "));
      return;
    }

    setRecipe(parsed.data);
  }

  // ... render
}
```

## Model selection

Do not copy a model name from an example without checking it. Model identifiers age
quickly. Ask the user which model to use, or check the provider's current model list,
rather than defaulting to whatever appears in older documentation.

## Streaming

For chat interfaces use `streamText` on the server and `useChat` from `@ai-sdk/react`
on the client. In v7 a `UIMessage` holds a `parts` array rather than a plain string, so
render by switching on `part.type` (`text`, `reasoning`, `tool-*`) instead of reading
`message.content`.
