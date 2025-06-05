// src/App.tsx
import React, { useEffect, useRef } from "react";
import { loadGgWave } from "./ggwaveLoader";
import { toggleSpeechRecognition } from "./utils/speech";

// main.jsの型変換ユーティリティをTypeScript化
function convertTypedArray<
  T extends ArrayBufferView,
  U extends ArrayBufferView
>(src: T, type: { new (buffer: ArrayBuffer): U }): U {
  const buffer = new ArrayBuffer(src.byteLength);
  new (src.constructor as any)(buffer).set(src);
  return new type(buffer);
}

function App() {
  const [ggwave, setGgWave] = React.useState<any>(null);
  const [encodeResult, setEncodeResult] = React.useState<string>("");
  const [decodeResult, setDecodeResult] = React.useState<string>("");
  const [lastWaveform, setLastWaveform] = React.useState<Float32Array | null>(
    null
  );
  const [inputText, setInputText] = React.useState<string>("hello js");
  const [speechText, setSpeechText] = React.useState<string>("");
  const [isListening, setIsListening] = React.useState(false);
  const speechTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [protocolIdInfo, setProtocolIdInfo] = React.useState<string>("");

  // ggwave params/instance をグローバルで保持
  const paramsRef = React.useRef<any>(null);
  const instanceRef = React.useRef<any>(null);

  // Audio context for playback
  const audioCtxRef = React.useRef<AudioContext | null>(null);

  // --- ggwaveマイク受信用 ---
  const [isCapturing, setIsCapturing] = React.useState(false);
  const recorderRef = React.useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = React.useRef<MediaStreamAudioSourceNode | null>(null);

  // 音声認識のトグル処理
  const handleToggleSpeechRecognition = () => {
    if (!speechTextareaRef.current) return;

    toggleSpeechRecognition(
      speechTextareaRef.current,
      "ja-JP",
      () => {
        setIsListening(true);
        setSpeechText(""); // 音声認識開始時にクリア
      },
      () => {
        setIsListening(false);
      },
      (err: any) => {
        console.error("音声認識エラー:", err);
        setIsListening(false);
      }
    );

    // 排他制御: キャプチャ中なら停止、そうでなければ開始
    if (isCapturing) {
      handleStopCapture();
    } else {
      handleStartCapture();
    }
  };

  // 音声認識のテキストをエンコード用にコピー
  const handleUseSpeechText = () => {
    setInputText(speechText);
  };

  useEffect(() => {
    loadGgWave().then((ggwaveObj) => {
      setGgWave(ggwaveObj);
      console.log("ggwave loaded", ggwaveObj);
      if (typeof ggwaveObj.ProtocolId === "function") {
        const proto = ggwaveObj.ProtocolId();
        setProtocolIdInfo(JSON.stringify(proto));
        console.log("ProtocolId():", proto);
      }
    });
  }, []);

  // --- マイク受信開始 ---
  const handleStartCapture = async () => {
    if (!ggwave) return;
    setDecodeResult("");
    setIsCapturing(true);
    if (!audioCtxRef.current) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass({ sampleRate: 48000 });
    }
    if (!paramsRef.current) {
      paramsRef.current = ggwave.getDefaultParameters();
      paramsRef.current.sampleRateInp = audioCtxRef.current.sampleRate;
      paramsRef.current.sampleRateOut = audioCtxRef.current.sampleRate;
    }
    if (!instanceRef.current) {
      instanceRef.current = ggwave.init(paramsRef.current);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });
      const ctx = audioCtxRef.current!;
      const mediaStream = ctx.createMediaStreamSource(stream);
      mediaStreamRef.current = mediaStream;
      const bufferSize = 1024;
      const numberOfInputChannels = 1;
      const numberOfOutputChannels = 1;
      const recorder = ctx.createScriptProcessor(
        bufferSize,
        numberOfInputChannels,
        numberOfOutputChannels
      );
      recorder.onaudioprocess = (e) => {
        const source = e.inputBuffer;
        // ggwave.decode expects Int8Array
        const int8buf = convertTypedArray(
          new Float32Array(source.getChannelData(0)),
          Int8Array
        );
        let res;
        try {
          res = ggwave.decode(instanceRef.current, int8buf);
        } catch (err) {
          setDecodeResult(`decode error: ${String(err)}`);
          return;
        }
        if (res && res.length > 0) {
          const text = new TextDecoder("utf-8").decode(res);
          setDecodeResult(`decoded: ${text}`);
        }
      };
      mediaStream.connect(recorder);
      recorder.connect(ctx.destination);
      recorderRef.current = recorder;
      setDecodeResult("Listening ...");
    } catch (err) {
      setDecodeResult(`マイク取得エラー: ${String(err)}`);
      setIsCapturing(false);
    }
  };

  // --- マイク受信停止 ---
  const handleStopCapture = () => {
    setIsCapturing(false);
    setDecodeResult("Audio capture is paused! 受信開始ボタンで再開できます");
    try {
      if (recorderRef.current) {
        recorderRef.current.disconnect();
        recorderRef.current.onaudioprocess = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.disconnect();
      }
      recorderRef.current = null;
      mediaStreamRef.current = null;
    } catch (e) {
      // ignore
    }
  };

  // --- アンマウント時クリーンアップ ---
  useEffect(() => {
    return () => {
      handleStopCapture();
    };
  }, []);

  const [encodeError, setEncodeError] = React.useState<string>("");

  // main.js準拠: encode→Float32Arrayに変換してAudioContextで再生
  const handleEncode = () => {
    setEncodeError("");
    setDecodeResult("");
    if (!ggwave) return;
    if (!paramsRef.current) {
      paramsRef.current = ggwave.getDefaultParameters();
    }
    if (!instanceRef.current) {
      instanceRef.current = ggwave.init(paramsRef.current);
    }
    const payload = inputText;
    try {
      const protocol =
        (ggwave.ProtocolId && ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST) ||
        1;
      const waveform = ggwave.encode(
        instanceRef.current,
        payload,
        protocol,
        10
      );
      // main.js同様にFloat32Arrayへ型変換
      const buf = convertTypedArray(waveform, Float32Array);
      setEncodeResult(`waveform length: ${buf.length}`);
      setLastWaveform(buf);
      // 再生
      handlePlay(buf);
    } catch (e) {
      setEncodeError(`encode error: ${String(e)}`);
    }
  };

  // main.jsの再生処理に合わせてbufを引数で受ける
  const handlePlay = async (bufOverride?: Float32Array | null) => {
    setEncodeError("");
    const buf = bufOverride || lastWaveform;
    if (!buf) return;
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const AudioContextClass =
          window.AudioContext || (window as any).webkitAudioContext;
        ctx = new AudioContextClass();
        audioCtxRef.current = ctx;
      }
      const buffer = ctx.createBuffer(1, buf.length, ctx.sampleRate);
      buffer.getChannelData(0).set(buf);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      source.onended = () => {
        // 必要に応じてctx.close();
      };
    } catch (e) {
      setEncodeError(`playback error: ${String(e)}`);
    }
  };

  // main.js準拠: decode時にInt8Arrayへ型変換してdecode
  const handleDecode = () => {
    if (!ggwave) return;

    // params と instance が初期化されていない場合は初期化
    if (!paramsRef.current) {
      paramsRef.current = ggwave.getDefaultParameters();
    }
    if (!instanceRef.current) {
      instanceRef.current = ggwave.init(paramsRef.current);
    }

    if (!lastWaveform) {
      setDecodeResult("decode error: no waveform data");
      return;
    }

    try {
      const int8buf = convertTypedArray(lastWaveform, Int8Array);
      let res = ggwave.decode(instanceRef.current, int8buf);
      if (res && res.length > 0) {
        const text = new TextDecoder("utf-8").decode(res);
        setDecodeResult(`decoded: ${text}`);
      } else {
        setDecodeResult("decoded: (empty or null)");
      }
    } catch (e) {
      setDecodeResult(`decode error: ${String(e)}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-100 flex flex-col items-center py-8 px-2">
      <div className="w-full max-w-xl bg-white shadow-lg rounded-xl p-8">
        {ggwave ? (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4 text-purple-700 text-center">
                音声通信デモ
              </h2>
              <section className="mb-8">
                <h3 className="text-lg font-semibold mb-2">音声入力</h3>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={handleToggleSpeechRecognition}
                    className={`px-4 py-2 rounded transition-colors font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-400 ${
                      isListening
                        ? "bg-red-500 hover:bg-red-400"
                        : "bg-green-500 hover:bg-green-400"
                    } text-white`}
                  >
                    {isListening ? "マイクOFF" : "マイクON"}
                  </button>
                </div>
                <textarea
                  ref={speechTextareaRef}
                  value={speechText}
                  onChange={(e) => setSpeechText(e.target.value)}
                  className="w-full min-h-[100px] p-2 text-base rounded border border-gray-300 mb-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
                  placeholder="音声認識の結果がここに表示されます"
                />
              </section>

              <section className="mb-8">
                <h3 className="text-lg font-semibold mb-2">
                  エンコードする文字列
                </h3>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 p-2 text-base rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="エンコードする文字列を入力"
                  />
                  <button
                    onClick={handleEncode}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400"
                  >
                    Encode
                  </button>
                </div>
                {speechText && (
                  <button
                    onClick={handleUseSpeechText}
                    className="mt-2 px-4 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-400"
                  >
                    音声認識の結果をコピー
                  </button>
                )}
              </section>
              <button
                onClick={handleDecode}
                disabled={!lastWaveform}
                className="ml-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-white rounded font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                decode
              </button>
            </div>
            {/* --- 追加: マイク受信ボタン --- */}
            <div className="mb-4 flex gap-2">
              {!isCapturing ? (
                <button
                  onClick={handleStartCapture}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-400"
                >
                  受信開始（マイク）
                </button>
              ) : (
                <button
                  onClick={handleStopCapture}
                  className="px-4 py-2 bg-gray-500 hover:bg-gray-400 text-white rounded font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                >
                  受信停止
                </button>
              )}
            </div>
            {encodeError && (
              <p className="text-red-500 font-semibold">{encodeError}</p>
            )}
            {encodeResult && (
              <p className="text-green-700 font-semibold">{encodeResult}</p>
            )}
            {decodeResult && (
              <p className="text-blue-700 font-semibold">{decodeResult}</p>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-center">ggwave 読み込み中...</p>
        )}
      </div>
    </div>
  );
}

export default App;
