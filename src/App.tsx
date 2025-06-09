/// <reference lib="dom" />
// src/App.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import debounce from "lodash/debounce";
import { loadGgWave } from "./ggwaveLoader";
import { toggleSpeechRecognition } from "./utils/speech";

import { hiraToKata } from "./utils/kana";

// main.jsの型変換ユーティリティをTypeScript化
function convertTypedArray<
  T extends ArrayBufferView,
  U extends ArrayBufferView
>(src: T, type: { new (buffer: ArrayBuffer): U }): U {
  const buffer = new ArrayBuffer(src.byteLength);
  new (src.constructor as any)(buffer).set(src);
  return new type(buffer);
}

// 型定義（SpeechRecognitionEventのみ拡張）
declare global {
  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: {
      isFinal: boolean;
      0: { transcript: string };
      length: number;
    }[];
    length: number;
  }
}

function App() {
  const debugMode = import.meta.env.VITE_DEBUG === "true";
  const [ggwave, setGgWave] = useState<{ [key: string]: any } | null>(null);
  // encodeResultは未使用なので削除

  const [decodeResult, setDecodeResult] = useState<string>("");
  const [lastWaveform, setLastWaveform] = useState<Float32Array | null>(null);
  const [inputText, setInputText] = useState<string>("");

  // inputText更新時のイベント発火
  useEffect(() => {
    if (inputText !== "") {
      handleEncode();
    }
  }, [inputText]);

  const [speechText, setSpeechText] = useState<string>("");
  const [isListening, setIsListening] = useState(false);

  // speechText更新時にOpenRouter AIへ問い合わせ（debounceで制御）
  const debouncedAskOpenRouter = useMemo(
    () =>
      debounce(() => {
        if (speechText !== "") {
          handleAskOpenRouter();
        }
      }, 1000), // 1000ms入力が止まったら送信
    [speechText]
  );
  useEffect(() => {
    debouncedAskOpenRouter();
    // cleanupでキャンセル
    return () => {
      debouncedAskOpenRouter.cancel();
    };
  }, [speechText, debouncedAskOpenRouter]);
  const speechTextareaRef = useRef<HTMLTextAreaElement>(null);

  // OpenRouter AI
  // aiResponseは未使用なので削除

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>("");

  const paramsRef = useRef<{ [key: string]: any } | null>(null);
  const instanceRef = useRef<{ [key: string]: any } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null); // DOM libで解決

  const [isCapturing, setIsCapturing] = useState(false);
  const recorderRef = useRef<ScriptProcessorNode | null>(null); // DOM libで解決
  const mediaStreamRef = useRef<MediaStreamAudioSourceNode | null>(null); // DOM libで解決

  const handleToggleSpeechRecognition = () => {
    if (!speechTextareaRef.current) return;

    toggleSpeechRecognition(
      speechTextareaRef.current,
      "ja-JP",
      () => {
        setIsListening(true);
        // setSpeechText(""); // ここはクリアしない
      },
      () => {
        setIsListening(false);
      },
      (err: unknown) => {
        console.error("音声認識エラー:", err);
        setIsListening(false);
      },
      (event: SpeechRecognitionEvent) => {
        // 最終認識結果だけspeechTextに反映
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            if (result[0].transcript.length > 0) {
              setSpeechText(result[0].transcript);
              console.log("認識結果:", result[0].transcript);
            }
          }
        }
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

  // OpenRouter AIへ問い合わせ
  const handleAskOpenRouter = async (): Promise<void> => {
    setIsAiLoading(true);
    setAiError("");

    try {
      // Cloudflare Functions経由でOpenRouter APIを呼び出す
      const res = await fetch("/api/openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: speechText }), // 音声認識テキストを送信
      });

      if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
      }

      const data: any = await res.json();
      console.log("OpenRouter API Response:", data);
      const responseText = data.choices?.[0]?.message?.content || "";

      const responseTextKata = hiraToKata(responseText);
      console.log("Response Text:", responseTextKata);

      setInputText(responseTextKata);
    } catch (err) {
      setAiError("AI連携エラー");
      if (import.meta.env.MODE === "development") {
        console.error(err);
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    loadGgWave().then((ggwaveObj) => {
      setGgWave(ggwaveObj);
      console.log("ggwave loaded", ggwaveObj);
      if (typeof ggwaveObj.ProtocolId === "function") {
        const proto = ggwaveObj.ProtocolId();
        console.log("ProtocolId():", proto);
      }
    });
  }, []);

  // --- マイク受信開始 ---
  const handleStartCapture = async (): Promise<void> => {
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
      if (paramsRef.current && audioCtxRef.current) {
        paramsRef.current.sampleRateInp = audioCtxRef.current.sampleRate;
        paramsRef.current.sampleRateOut = audioCtxRef.current.sampleRate;
      }
    }
    if (!instanceRef.current) {
      instanceRef.current = ggwave.init(paramsRef.current);
    }
    try {
      const stream = await (
        window.navigator as Navigator
      ).mediaDevices.getUserMedia({
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
      recorder.onaudioprocess = (e: AudioProcessingEvent) => {
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
          setDecodeResult(`${text}`);
        }
      };
      mediaStream.connect(recorder);
      recorder.connect(ctx.destination);
      recorderRef.current = recorder;
      setDecodeResult("Listening ...");
    } catch (err) {
      setDecodeResult(
        `マイク取得エラー: ${err instanceof Error ? err.message : String(err)}`
      );
      setIsCapturing(false);
    }
  };

  // --- マイク受信停止 ---
  const handleStopCapture = (): void => {
    setIsCapturing(false);
    setDecodeResult("");
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
    } catch (_e) {
      // ignore
    }
  };

  // --- アンマウント時クリーンアップ ---
  useEffect(() => {
    return () => {
      handleStopCapture();
    };
  }, []);

  const [encodeError, setEncodeError] = useState<string>("");

  // main.js準拠: encode→Float32Arrayに変換してAudioContextで再生
  const handleEncode = (): void => {
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
      setLastWaveform(buf);
      // 再生
      handlePlay(buf);
    } catch (e) {
      setEncodeError(
        `encode error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  // main.jsの再生処理に合わせてbufを引数で受ける
  const handlePlay = async (
    bufOverride?: Float32Array | null
  ): Promise<void> => {
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
      setEncodeError(
        `playback error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  // main.js準拠: decode時にInt8Arrayへ型変換してdecode
  const handleDecode = (): void => {
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
      setDecodeResult(
        `decode error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex flex-col">
      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 flex flex-col items-center justify-center py-12 px-2">
        {/* キャラクターイメージ */}
        <div className="relative -mb-16 z-20">
          <img
            src="images/konchi1.png"
            alt="サービスのメインキャラクター"
            className="w-60 h-60 rounded-2xl object-contain mx-auto shadow-2xl border-4 border-white bg-white"
            style={{ marginTop: "-48px" }}
          />
        </div>
        {/* メインカード */}
        <section className="w-full max-w-2xl bg-white shadow-2xl rounded-3xl p-5 pt-24 mt-0 relative z-10 flex flex-col gap-10 border border-gray-100">
          {/* タイトル */}
          <div className="flex flex-col items-center mb-4">
            <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight text-center mb-2 leading-tight">
              <span className="block text-blue-700 uppercase text-base tracking-widest font-bold mb-1">
                シュウジ・イトウになりきって
              </span>
              コンチと会話しよう
            </h1>
            <div className="h-1 w-16 bg-gradient-to-r from-blue-500 via-yellow-400 to-red-500 rounded-full mb-2" />
          </div>

          {/* 音声入力セクション */}
          <section className="flex flex-col gap-6">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span className="block w-2 h-6 bg-blue-500 rounded-full mr-2" />
              音声入力
            </h2>
            <div className="flex gap-4 items-center">
              <button
                className={`font-extrabold rounded-xl px-8 py-3 text-lg transition shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 flex items-center gap-2 ${
                  isListening
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-konchi-pink hover:bg-konchi-pink-dark text-white"
                }`}
                onClick={handleToggleSpeechRecognition}
              >
                {isListening ? "マイクOFF" : "マイクON"}
                <span className="text-2xl font-black">&gt;</span>
              </button>
            </div>
            <textarea
              ref={speechTextareaRef}
              value={speechText}
              onChange={(e) => setSpeechText(e.target.value)}
              className="w-full min-h-[100px] p-3 text-lg rounded-xl border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
              placeholder="音声認識の結果がここに表示されます"
            />
          </section>

          {/* AI応答・結果表示 */}
          <section className="flex flex-col gap-4">
            <div className="p-4 bg-gradient-to-r from-blue-50 to-yellow-50 rounded-xl border-l-4 border-blue-400 shadow flex items-center">
              <span className="text-lg font-bold text-blue-700 mr-2">
                コンチ：
              </span>
              {decodeResult && (
                <span className="text-gray-900 text-lg">{decodeResult}</span>
              )}
            </div>

            {debugMode && (
              <div className="flex gap-2">
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-6 py-2 transition shadow"
                  onClick={handleAskOpenRouter}
                  disabled={isAiLoading || !speechText}
                >
                  {isAiLoading ? "送信中..." : "OpenRouterに送信"}
                  <span className="ml-2 text-xl">&gt;</span>
                </button>
              </div>
            )}
            {aiError && <p className="text-red-500 font-semibold">{aiError}</p>}
          </section>

          {/* デバッグ用エンコード・デコード */}
          {debugMode && (
            <section className="flex flex-col gap-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span className="block w-2 h-6 bg-yellow-400 rounded-full mr-2" />
                エンコードする文字列
              </h3>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 p-3 text-lg rounded-xl border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-300 bg-gray-50"
                  placeholder="エンコードする文字列を入力"
                />
                <button
                  className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-xl px-6 py-2 transition shadow"
                  onClick={handleEncode}
                >
                  Encode
                  <span className="ml-2 text-xl">&gt;</span>
                </button>
              </div>
              {encodeError && (
                <p className="text-red-500 font-semibold">{encodeError}</p>
              )}
            </section>
          )}
        </section>
        {/* フッター */}
        <footer className="w-full text-center mt-8 text-sm text-gray-400">
          <span>© 2025 GQuuuuuuX Fan Project</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
