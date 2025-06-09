// src/ggwaveLoader.ts

// ggwaveを初期化して返す関数をエクスポート

export async function loadGgWave() {
  // ggwaveパッケージのファクトリ関数を動的import
  const factoryModule = await import('ggwave');
  const factory = factoryModule.default || factoryModule;
  // 初期化して返す
  const ggwave = await factory();
  return ggwave;
}