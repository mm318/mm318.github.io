/* All resources are local and relative to this worker, including on project Pages sites. */
const status = text => self.postMessage({type: 'status', text});
async function download(name) {
  const response = await fetch(new URL(name, self.location.href));
  if (!response.ok) throw new Error(`Could not download ${name}: HTTP ${response.status}`);
  return response;
}
async function digest(data) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
}
self.onmessage = async () => {
  try {
    status('Downloading game data...');
    const metadata = await (await download('index.data.json')).json();
    if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > 512 * 1024 * 1024 ||
        !Number.isSafeInteger(metadata.compressedSize) || !/^[a-f0-9]{64}$/.test(metadata.sha256)) throw new Error('Invalid game data manifest');
    const input = await (await download('index.data.br')).arrayBuffer();
    let output;
    // Some servers (including emrun) automatically decode .br responses.
    if (input.byteLength === metadata.size && await digest(input) === metadata.sha256) output = input;
    else {
      if (input.byteLength !== metadata.compressedSize) throw new Error('Incomplete game data download');
      status('Decompressing game data...');
      const binary = await (await download('brotli.wasm')).arrayBuffer();
      const {instance} = await WebAssembly.instantiate(binary, {env: {emscripten_notify_memory_growth() {}}});
      const decoder = instance.exports;
      decoder._initialize();
      const encoded = decoder.malloc(input.byteLength);
      const decoded = decoder.malloc(metadata.size);
      const length = decoder.malloc(4);
      try {
        if (!encoded || !decoded || !length) throw new Error('Not enough memory to decompress game data');
        new Uint8Array(decoder.memory.buffer, encoded, input.byteLength).set(new Uint8Array(input));
        new DataView(decoder.memory.buffer).setUint32(length, metadata.size, true);
        const result = decoder.BrotliDecoderDecompress(input.byteLength, encoded, length, decoded);
        if (result !== 1 || new DataView(decoder.memory.buffer).getUint32(length, true) !== metadata.size) throw new Error('Game data decompression failed');
        output = new Uint8Array(decoder.memory.buffer, decoded, metadata.size).slice().buffer;
      } finally {
        decoder.free(encoded);
        decoder.free(decoded);
        decoder.free(length);
      }
      if (await digest(output) !== metadata.sha256) throw new Error('Game data is damaged or does not match this build');
    }
    self.postMessage({type: 'ready', data: output}, [output]);
    self.close();
  } catch (error) {
    self.postMessage({type: 'error', message: error.message});
    self.close();
  }
};
