// src/App.tsx
import React, { useEffect } from "react";
import { loadGgWave } from "./ggwaveLoader";

function App() {
  const [ggwave, setGgWave] = React.useState<any>(null);
  const [encodeResult, setEncodeResult] = React.useState<string>("");
  const [decodeResult, setDecodeResult] = React.useState<string>("");
  const [lastWaveform, setLastWaveform] = React.useState<Float32Array | null>(
    null
  );
  const [inputText, setInputText] = React.useState<string>("hello js");

  const [protocolIdInfo, setProtocolIdInfo] = React.useState<string>("");

  // ggwave params/instance をグローバルで保持
  const paramsRef = React.useRef<any>(null);
  const instanceRef = React.useRef<any>(null);

  // 録音用state
  const [recording, setRecording] = React.useState(false);
  const [mediaStream, setMediaStream] = React.useState<MediaStream|null>(null);
  const audioCtxRef = React.useRef<AudioContext|null>(null);
  const recorderRef = React.useRef<ScriptProcessorNode|null>(null);
  const recordedChunksRef = React.useRef<Float32Array[]>([]);

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

  const [encodeError, setEncodeError] = React.useState<string>("");

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
      const waveform = ggwave.encode(
        instanceRef.current,
        payload,
        1, // プロトコルIDを直接指定
        10
      );
      setEncodeResult(`waveform length: ${waveform.length}`);
      setLastWaveform(waveform);
      // waveformの型・値を調査
      if (waveform) {
        const arr = waveform instanceof Float32Array || waveform instanceof Int8Array || waveform instanceof Uint8Array ? waveform : new Float32Array(waveform);
        const headStr = String.fromCharCode(...arr.slice(0, 16));
        console.log('waveform type:', arr.constructor.name, 'length:', arr.length, 'head:', Array.from(arr.slice(0, 10)), 'headStr:', headStr);
      }
    } catch (e) {
      setEncodeError(`encode error: ${String(e)}`);
    }
  };

  const handleDecode = () => {
    if (!ggwave || !lastWaveform) return;
    try {
      if (!paramsRef.current || !instanceRef.current) {
        setDecodeResult("decode error: params/instance not initialized");
        return;
      }
      const decoded = ggwave.decode(instanceRef.current, lastWaveform);
      console.log("decode result", decoded);
      if (decoded == null) {
        setDecodeResult("decoded: null or undefined");
      } else if (typeof decoded === "string") {
        setDecodeResult(`decoded: ${decoded}`);
      } else if (decoded instanceof Int8Array || decoded instanceof Uint8Array) {
        if (decoded.length === 0) {
          setDecodeResult("decoded: (empty array)");
        } else {
          const text = new TextDecoder().decode(decoded);
          setDecodeResult(`decoded: ${text}`);
        }
      } else {
        setDecodeResult(`decoded (raw): ${String(decoded)}`);
      }
    } catch (e) {
      setDecodeResult(`decode error: ${String(e)}`);
    }
  };

  // 録音スタート
  const handleStartRecording = async () => {
    setDecodeResult("");
    setRecording(true);
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;
    // main.jsと同様: AudioContextサンプルレートでパラメータ初期化
    if (ggwave) {
      const params = ggwave.getDefaultParameters();
      params.sampleRateInp = ctx.sampleRate;
      params.sampleRateOut = ctx.sampleRate;
      paramsRef.current = params;
      instanceRef.current = ggwave.init(params);
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    setMediaStream(stream);
    const source = ctx.createMediaStreamSource(stream);
    const recorder = ctx.createScriptProcessor(4096, 1, 1);
    recorder.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      // deep copy
      recordedChunksRef.current.push(new Float32Array(input));
      // --- リアルタイムdecode（累積バッファでdecode）---
      if (ggwave && paramsRef.current && instanceRef.current) {
        // 全録音バッファを連結
        const totalLen = recordedChunksRef.current.reduce((acc, cur) => acc + cur.length, 0);
        const flat = new Float32Array(totalLen);
        let pos = 0;
        for (const chunk of recordedChunksRef.current) {
          flat.set(chunk, pos);
          pos += chunk.length;
        }
        // ArrayBuffer共有型Int8Arrayでdecode
        const int8 = new Int8Array(flat.buffer, flat.byteOffset, flat.length);
        try {
          const decoded = ggwave.decode(instanceRef.current, int8);
          if (typeof decoded === 'string' && decoded.length > 0) {
            setDecodeResult(`decoded: ${decoded}`);
            // 録音自動停止
            setRecording(false);
            try {
              recorder.disconnect();
              ctx.close();
              if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
            } catch {}
          } else if ((decoded instanceof Int8Array || decoded instanceof Uint8Array) && decoded.length > 0) {
            const text = new TextDecoder().decode(decoded);
            setDecodeResult(`decoded: ${text}`);
            setRecording(false);
            try {
              recorder.disconnect();
              ctx.close();
              if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
            } catch {}
          }
        } catch {}
      }
    };
    source.connect(recorder);
    recorder.connect(ctx.destination);
    recorderRef.current = recorder;
    recordedChunksRef.current = [];
  };

  // 録音ストップ＆decode
  const handleStopRecording = () => {
    setRecording(false);
    try {
      if (recorderRef.current) recorderRef.current.disconnect();
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    } catch {}
    // バッファ結合
    const all = recordedChunksRef.current;
    const flat = new Float32Array(all.reduce((acc, cur) => acc + cur.length, 0));
    let pos = 0;
    for (const chunk of all) {
      flat.set(chunk, pos);
      pos += chunk.length;
    }
    // バッファ統計を表示
    if (flat && flat.length > 0) {
      let min = flat[0], max = flat[0], sum = 0;
      for (let i = 0; i < flat.length; ++i) {
        if (flat[i] < min) min = flat[i];
        if (flat[i] > max) max = flat[i];
        sum += flat[i];
      }
      const avg = sum / flat.length;
      console.log('録音バッファ: min', min, 'max', max, 'avg', avg, 'length', flat.length);
    }
    // decode
    if (ggwave && paramsRef.current && instanceRef.current) {
      if (!flat || flat.length === 0) {
        setDecodeResult('decode error: 録音データが空です');
        return;
      }
      try {
        // main.jsと同じ: ArrayBuffer共有型Int8Arrayでdecode
        const int8 = new Int8Array(flat.buffer, flat.byteOffset, flat.length);
        const decoded = ggwave.decode(instanceRef.current, int8);
        console.log('decode result type:', typeof decoded, decoded instanceof Uint8Array ? 'Uint8Array' : '', decoded instanceof Int8Array ? 'Int8Array' : '', decoded);
        if (typeof decoded === 'string') {
          setDecodeResult(`decoded: ${decoded}`);
        } else if ((decoded instanceof Int8Array || decoded instanceof Uint8Array) && decoded.length > 0) {
          const text = new TextDecoder().decode(decoded);
          setDecodeResult(`decoded: ${text}`);
        } else {
          setDecodeResult('(decode result not string)');
        }
      } catch (e) {
        setDecodeResult('decode error: ' + String(e));
      }
    }
  };

  // エンコード音声を再生（main.js公式準拠）
  const handlePlay = async () => {
    setEncodeError("");
    if (!lastWaveform || !ggwave) return;
    try {
      // AudioContextを再利用 or 新規生成
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        ctx = new AudioContextClass();
        audioCtxRef.current = ctx;
      }
      // main.jsと同じ型変換で再生
      const buf = new Float32Array(lastWaveform.buffer, lastWaveform.byteOffset, lastWaveform.length);
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


  return (
    <div>
      <h2>App.tsx 文字だけ表示</h2>
      <h3>ggwave オブジェクト情報</h3>
      {ggwave ? (
        <>
          <ul>
            {Object.entries(ggwave).map(([key, value]) => (
              <li key={key}>
                <strong>{key}</strong>:{" "}
                {typeof value === "function"
                  ? "function"
                  : typeof value === "object"
                  ? Object.prototype.toString.call(value)
                  : String(value)}
              </li>
            ))}
          </ul>
          <div style={{ margin: "1em 0" }}>
            <strong>ProtocolId():</strong>{" "}
            <span style={{ fontFamily: "monospace" }}>{protocolIdInfo}</span>
          </div>
          <div style={{ margin: "1em 0" }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              style={{ width: "60%", fontSize: "1em" }}
              placeholder="エンコードする文字列を入力"
            />
            <button onClick={handleEncode} style={{ marginLeft: "0.5em" }}>
              encode
            </button>
            <button
              onClick={handleDecode}
              disabled={!lastWaveform}
              style={{ marginLeft: "0.5em" }}
            >
              decode
            </button>
          </div>
          {encodeError && <p style={{ color: "red" }}>{encodeError}</p>}
          {encodeResult && <p>{encodeResult}</p>}
          {decodeResult && <p>{decodeResult}</p>}
          <div style={{margin:'1em 0'}}>
            <button
              onClick={handlePlay}
              disabled={!lastWaveform}
            >
              エンコード音声を再生
            </button>
          </div>
          <div style={{margin:'1em 0'}}>
            <button onClick={handleStartRecording} disabled={recording} style={{marginRight: '0.5em'}}>マイク録音開始</button>
            <button onClick={handleStopRecording} disabled={!recording}>録音停止→decode</button>
            {recording && <span style={{color:'green',marginLeft:'1em'}}>●録音中</span>}
          </div>
        </>
      ) : (
        <p>ggwave 読み込み中...</p>
      )}
    </div>
  );
}

export default App;
