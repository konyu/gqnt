// src/App.tsx
import React, { useEffect } from "react";
import { loadGgWave } from "./ggwaveLoader";

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

  const [protocolIdInfo, setProtocolIdInfo] = React.useState<string>("");

  // ggwave params/instance をグローバルで保持
  const paramsRef = React.useRef<any>(null);
  const instanceRef = React.useRef<any>(null);

  // Audio context for playback
  const audioCtxRef = React.useRef<AudioContext | null>(null);

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
    <div>
      {ggwave ? (
        <>
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
        </>
      ) : (
        <p>ggwave 読み込み中...</p>
      )}
    </div>
  );
}

export default App;
