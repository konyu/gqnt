// konchi.js
// 「コンチと会話しよう」機能UI・ロジック
import { toggleSpeechRecognition, startSpeechRecognition, stopSpeechRecognition } from '../speech.js';
import { converseWithKataKotoBot } from '../openai_chat.js';

let konchiActive = false;
let apiKey = '';

export function setupKonchiChat({
    micBtn, userTextArea, botTextArea, sendBtn, apiKeyInput, statusEl, ggwave, context, instance, convertTypedArray
}) {
    console.log('[konchi] setupKonchiChat called');
    console.log('[konchi] micBtn:', micBtn);

    let recognizing = false;
    let lastUserText = '';
    let pending = false;

    micBtn.addEventListener('click', () => {
        console.log('[konchi] micBtn clicked. recognizing=', recognizing);
        if (!recognizing) {
            console.log('[konchi] startSpeechRecognition呼び出し');
            startSpeechRecognition(userTextArea, 'ja-JP', () => {
                console.log('[konchi] startSpeechRecognition.onStart');
                recognizing = true;
                micBtn.textContent = 'マイクOFF';
                statusEl.textContent = 'マイクON: 喋ってください';
            }, () => {
                console.log('[konchi] startSpeechRecognition.onEnd');
                recognizing = false;
                micBtn.textContent = 'マイクON';
                statusEl.textContent = 'マイクOFF';
            }, (err) => {
                console.log('[konchi] startSpeechRecognition.onError', err);
                statusEl.textContent = '音声認識エラー: ' + (err && err.error);
                recognizing = false;
                micBtn.textContent = 'マイクON';
            });
        } else {
            console.log('[konchi] stopSpeechRecognition呼び出し');
            stopSpeechRecognition(() => {
                console.log('[konchi] stopSpeechRecognition.onEnd');
                recognizing = false;
                micBtn.textContent = 'マイクON';
                statusEl.textContent = 'マイクOFF';
            });
        }
    });

    sendBtn.addEventListener('click', async () => {
        if (pending) return;
        const userText = userTextArea.value.trim();
        if (!userText) return;
        if (!apiKeyInput.value.trim()) {
            statusEl.textContent = 'OpenAI APIキーを入力してください';
            return;
        }
        pending = true;
        sendBtn.disabled = true;
        statusEl.textContent = 'コンチが考え中...';
        try {
            const response = await converseWithKataKotoBot(userText, apiKeyInput.value.trim());
            botTextArea.value = response;
            // ggwaveで音声再生
            if (ggwave && instance && context) {
                const protocol = (ggwave.ProtocolId && ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST) || 1;
                const waveform = ggwave.encode(instance, response, protocol, 10);
                const buf = convertTypedArray(waveform, Float32Array);
                const buffer = context.createBuffer(1, buf.length, context.sampleRate);
                buffer.getChannelData(0).set(buf);
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(context.destination);
                source.start(0);
            }
            statusEl.textContent = 'コンチの返事を再生しました';
        } catch (e) {
            botTextArea.value = '';
            statusEl.textContent = 'エラー: ' + e.message;
        }
        sendBtn.disabled = false;
        pending = false;
    });
}
