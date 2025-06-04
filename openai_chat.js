// openai_chat.js
// OpenAI GPT-4o-mini APIでカタコト日本語Botと会話するユーティリティ
// 利用にはOpenAI APIキーが必要

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o'; // mini指定不可。mini=4oの廉価版として扱う

/**
 * ユーザー発話をカタコト日本語ボットで返す
 * @param {string} userText - ユーザー発話
 * @param {string} apiKey - OpenAI APIキー
 * @returns {Promise<string>} - ボットの返答
 */
export async function converseWithKataKotoBot(userText, apiKey) {
    const systemPrompt = 'あなたはカタコトの短い日本語で返事をするロボットです。返答はできるだけ簡単に、短く、カタコトで答えてください。';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };
    const body = {
        model: OPENAI_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
        ],
        max_tokens: 128,
        temperature: 0.5
    };
    const res = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error('OpenAI API error: ' + err);
    }
    const data = await res.json();
    return data.choices[0].message.content.trim();
}
