import { ExecutionContext, Fetcher } from '@cloudflare/workers-types';
// Request, Response はグローバル

type Env = {
  ASSETS: Fetcher;
  OPENROUTER_API_KEY: string;
  ALLOWED_ORIGIN?: string;
};


async function handleApiOpenrouter(request: Request, env: Env): Promise<Response> {
  const allowedOrigin = env.ALLOWED_ORIGIN || "";
  const requestOrigin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
  if (allowedOrigin && requestOrigin !== allowedOrigin) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  type RequestBody = { message: string };
  const body: unknown = await request.json();
  // 型ガード関数でバリデーション
  function isRequestBody(obj: any): obj is RequestBody {
    return (
      typeof obj === 'object' && obj !== null && typeof obj.message === 'string'
    );
  }
  if (!isRequestBody(body)) {
    return new Response("Invalid request body: 'message' is required.", { status: 400 });
  }
  const content = `
あなたはAIアシスタントです。[ユーザの入力]に対して、必ず20文字以内で返答してください。

[ユーザの入力]
${body.message}
`

  const openrouterBody = {
    model: "google/gemma-3n-e4b-it:free",
    messages: [
      {
        role: "system",
        content: content,
      },
    ],
  };

  const apiKey = env.OPENROUTER_API_KEY;
  const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(openrouterBody),
  });

  const resBody = await openrouterRes.text();
  return new Response(resBody, {
    status: openrouterRes.status,
    headers: {
      "Content-Type": openrouterRes.headers.get("Content-Type") || "application/json",
      "Access-Control-Allow-Origin": allowedOrigin,
    },
  });
}



export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // APIルート
    if (url.pathname === "/api/openrouter") {
      return handleApiOpenrouter(request, env);
    }

    // 静的ファイル配信（公式例通り）
    return env.ASSETS.fetch(request as any);
  }
};
