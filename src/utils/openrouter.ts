import OpenAI from 'openai';

// .envから環境変数を取得する
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = import.meta.env.VITE_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_REFERER = import.meta.env.VITE_OPENROUTER_REFERER || '';
const OPENROUTER_TITLE = import.meta.env.VITE_OPENROUTER_TITLE || '';

const openai = new OpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: OPENROUTER_API_KEY,
  dangerouslyAllowBrowser: true, // ★自己責任で追加
  defaultHeaders: {
    ...(OPENROUTER_REFERER ? { 'HTTP-Referer': OPENROUTER_REFERER } : {}),
    ...(OPENROUTER_TITLE ? { 'X-Title': OPENROUTER_TITLE } : {}),
  },
});

export async function chatWithOpenRouter(messages: { role: 'user' | 'system' | 'assistant', content: string }[], model: string = 'google/gemma-3n-e4b-it:free') {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set in .env');
  }
  const completion = await openai.chat.completions.create({
    model,
    messages,
  });
  return completion.choices[0].message;
}
