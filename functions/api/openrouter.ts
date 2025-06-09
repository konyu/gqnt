/// <reference types="@cloudflare/workers-types" />
import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  OPENROUTER_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}
// Cloudflare Pages Functions: OpenRouter API Proxy
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const allowedOrigin = context.env.ALLOWED_ORIGIN || "";
  const requestOrigin = context.request.headers.get("origin") || "";

  // CORSプリフライト対応
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // オリジンチェック（本リクエスト時も）
  if (allowedOrigin && requestOrigin !== allowedOrigin) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
      },
    });
  }

  // リクエストボディを取得
  const body = await context.request.json() as { message: string };

  // OpenRouter API仕様に合わせてbodyを組み立て
  const openrouterBody = {
    model: "google/gemma-3n-e4b-it:free", // 必要に応じて他モデルに変更可
    messages: [
      {
        role: "user",
        content: body.message,
      },
    ],
  };

  const apiKey = context.env.OPENROUTER_API_KEY;

  const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openrouterBody),
  });

  // 結果を返す
  const data = await openrouterRes.json();
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};


