let recognition: any = null;
let recognizing = false;

interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
}

declare var window: Window;

export function toggleSpeechRecognition(
    textarea: HTMLInputElement | HTMLTextAreaElement,
    lang = 'ja-JP',
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (error: any) => void,
    onResult?: (event: any) => void
) {
    if (recognizing) {
        stopSpeechRecognition(onEnd);
    } else {
        startSpeechRecognition(textarea, lang, onStart, onEnd, onError, onResult);
    }
}

function startSpeechRecognition(
    textarea: HTMLInputElement | HTMLTextAreaElement,
    lang = 'ja-JP',
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (error: any) => void,
    onResult?: (event: any) => void
) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('このブラウザは音声認識に対応していません');
        return;
    }
    if (recognizing) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
        recognizing = true;
        if (onStart) onStart();
    };

    recognition.onerror = (event: any) => {
        if (onError) onError(event);
    };

    recognition.onend = () => {
        recognizing = false;
        if (onEnd) onEnd();
    };

    recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
            textarea.value = finalTranscript;
            // Reactの状態更新をトリガー
            const eventInput = new Event('input', { bubbles: true });
            textarea.dispatchEvent(eventInput);
        }
        // 追加: React側に生のeventを渡す
        if (onResult) onResult(event);
    };

    try {
        recognition.start();
    } catch (e) {
        if (onError) onError(e);
    }
}

function stopSpeechRecognition(onEnd?: () => void) {
    if (recognition) {
        recognition.stop();
        if (onEnd) onEnd();
    }
    recognizing = false;
}
