// 日本語音声認識（Web Speech API）ユーティリティ
// startSpeechRecognition/stopSpeechRecognition でON/OFF

let recognition = null;
let recognizing = false;

export function toggleSpeechRecognition(textarea, lang = 'ja-JP', onStart, onEnd, onError) {
    if (recognizing) {
        stopSpeechRecognition(onEnd);
    } else {
        startSpeechRecognition(textarea, lang, onStart, onEnd, onError);
    }
}

export function startSpeechRecognition(textarea, lang = 'ja-JP', onStart, onEnd, onError) {
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
    recognition.onstart = function() {
        recognizing = true;
        if (onStart) onStart();
    };
    recognition.onerror = function(event) {
        if (onError) onError(event);
    };
    recognition.onend = function() {
        recognizing = false;
        if (onEnd) onEnd();
    };
    recognition.onresult = function(event) {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            finalTranscript += event.results[i][0].transcript;
        }
        textarea.value = finalTranscript;
    };
    recognition.start();
}

export function stopSpeechRecognition(onEnd) {
    if (recognition && recognizing) {
        recognition.stop();
        recognizing = false;
        if (onEnd) onEnd();
    }
}
