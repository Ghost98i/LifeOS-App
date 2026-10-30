import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// Match Vite's static ?raw SVG imports when rendering components in Node tests.
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.svg?raw')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))};`,
      };
    }
    if (url.startsWith('file:') && /\.(png|webp|svg|woff2|lottie)(\?.*)?$/.test(url)) {
      return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(url)};` };
    }
    return nextLoad(url, context);
  },
});
