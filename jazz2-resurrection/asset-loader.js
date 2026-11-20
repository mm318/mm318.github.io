/* Download and decode assets before Emscripten starts its filesystem preload. */
window.JazzAssets = {
  async start(module, scriptURL) {
    scriptURL = new URL(scriptURL, document.baseURI).href;
    const data = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('asset-worker.js', scriptURL));
      worker.onmessage = ({data: message}) => {
        if (message.type === 'status') module.setStatus(message.text);
        else {
          worker.terminate();
          if (message.type === 'ready') resolve(message.data);
          else reject(new Error(message.message));
        }
      };
      worker.onerror = event => {
        worker.terminate();
        reject(new Error(event.message || 'Asset worker failed'));
      };
      worker.postMessage({type: 'load'});
    });
    let packageData = data;
    module.getPreloadedPackage = (_name, size) => {
      if (!packageData || size !== packageData.byteLength) throw new Error('Game data does not match the executable');
      const result = packageData;
      packageData = null;
      return result;
    };
    module.setStatus('Starting game...');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptURL;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load the game executable'));
      document.body.appendChild(script);
    });
  }
};
