import { toggleSpeechRecognition } from './speech.js';
window.AudioContext = window.AudioContext || window.webkitAudioContext;

let context = null;
let recorder = null;
let ggwave = null;
let parameters = null;
let instance = null;
let mediaStream = null;
let rawStream = null; // 生のMediaStreamを保持

const sendText = document.getElementById("sendText");
const receivedText = document.getElementById("receivedText");
const sendBtn = document.getElementById("sendBtn");
const receiveBtn = document.getElementById("receiveBtn");
const stopReceiveBtn = document.getElementById("stopReceiveBtn");
const statusEl = document.getElementById("status");
const speechToggleBtn = document.getElementById("speechToggleBtn");

function setStatus(msg) {
    statusEl.textContent = msg;
}

function convertTypedArray(src, type) {
    const buffer = new ArrayBuffer(src.byteLength);
    new src.constructor(buffer).set(src);
    return new type(buffer);
}

function init() {
    if (!context) {
        context = new AudioContext({ sampleRate: 48000 });
    }
    parameters = ggwave.getDefaultParameters();
    parameters.sampleRateInp = context.sampleRate;
    parameters.sampleRateOut = context.sampleRate;
    instance = ggwave.init(parameters); // 毎回新しく生成
}

function onSend() {
    if (!ggwave || !instance || !context) {
        init();
    }
    // 送信時に受信を止めない
    const protocol = (ggwave.ProtocolId && ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST) || 1;
    const waveform = ggwave.encode(instance, sendText.value, protocol, 10);
    const buf = convertTypedArray(waveform, Float32Array);
    const buffer = context.createBuffer(1, buf.length, context.sampleRate);
    buffer.getChannelData(0).set(buf);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
    setStatus('送信完了');
}

sendBtn.onclick = onSend;

receiveBtn.onclick = function () {
    if (!ggwave || !instance || !context) {
        init();
    }
    navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false
        }
    }).then(function (stream) {
        rawStream = stream;
        mediaStream = context.createMediaStreamSource(stream);
        const bufferSize = 1024;
        const numberOfInputChannels = 1;
        const numberOfOutputChannels = 1;
        if (context.createScriptProcessor) {
            recorder = context.createScriptProcessor(bufferSize, numberOfInputChannels, numberOfOutputChannels);
        } else {
            recorder = context.createJavaScriptNode(bufferSize, numberOfInputChannels, numberOfOutputChannels);
        }
        recorder.onaudioprocess = function (ev) {
            const source = ev.inputBuffer;
            let res = ggwave.decode(instance, convertTypedArray(new Float32Array(source.getChannelData(0)), Int8Array));
            if (res && res.length > 0) {
                res = new TextDecoder("utf-8").decode(res);
                receivedText.value = res;
            }
        };
        mediaStream.connect(recorder);
        recorder.connect(context.destination);
        receivedText.value = "Listening ...";
        receiveBtn.hidden = true;      // 受信開始ボタンを非表示
        stopReceiveBtn.hidden = false; // 受信停止ボタンを表示
        setStatus('マイク受信中...');
    }).catch(function (err) {
        setStatus('マイクアクセス失敗: ' + err.message);
    });
};

stopReceiveBtn.onclick = function () {
    if (recorder) {
        try { recorder.disconnect(context.destination); } catch(e){}
        try { mediaStream && mediaStream.disconnect && mediaStream.disconnect(recorder); } catch(e){}
        recorder = null;
    }
    if (mediaStream) {
        try { mediaStream.disconnect(); } catch(e){}
        mediaStream = null;
    }
    if (rawStream) {
        rawStream.getTracks().forEach(track => track.stop());
        rawStream = null;
    }
    receivedText.value = 'Audio capture is paused! Press the "Start capturing" button to analyze audio from the microphone';
    receiveBtn.hidden = false;      // 受信開始ボタンを表示
    stopReceiveBtn.hidden = true;  // 受信停止ボタンを非表示
    setStatus('受信停止');
};

// ggwave.jsの初期化
ggwave_factory().then(function (obj) {
    ggwave = obj;
    setStatus('準備完了。送信または受信を開始してください');
    // UI初期状態
    receiveBtn.hidden = false;
    stopReceiveBtn.hidden = true;
});
// 受信は初期状態で停止
stopReceiveBtn.hidden = true;

// 音声認識トグル
let speechActive = false;
speechToggleBtn.addEventListener('click', () => {
    toggleSpeechRecognition(
        receivedText,
        'ja-JP',
        () => {
            speechActive = true;
            speechToggleBtn.textContent = '音声認識OFF';
            setStatus('音声認識中...');
        },
        () => {
            speechActive = false;
            speechToggleBtn.textContent = '音声認識ON';
            setStatus('音声認識停止');
        },
        (err) => {
            setStatus('音声認識エラー: ' + (err && err.error));
            speechActive = false;
            speechToggleBtn.textContent = '音声認識ON';
        }
    );
});