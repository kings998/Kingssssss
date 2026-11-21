import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';

function hopwebClassicHtmlPlugin(): Plugin {
  return {
    name: 'hopweb-classic-html',
    enforce: 'post',
    transformIndexHtml(html) {
      let out = html
        // Convert absolute public links to relative for Hopweb
        .replace(/href="\/manifest\.json"/g, 'href="./manifest.json"')
        .replace(/href="\/icon\.svg"/g, 'href="./icon.svg"')
        // Remove crossorigin attributes that cause file:// CORS blocks in Android WebView
        .replace(/\s+crossorigin(?:="[^"]*")?/g, '')
        // Convert Vite's <script type="module" src="..."> into a classic deferred script
        .replace(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/g, '<script defer src="$1"></script>')
        .replace(/<script\s+src="([^"]+)"\s+type="module"\s*><\/script>/g, '<script defer src="$1"></script>');

      // Ensure the deferred app script sits cleanly right before </body> instead of <head>
      const scriptMatch = out.match(/<script\s+defer\s+src="\.\/assets\/app\.js"><\/script>/);
      if (scriptMatch) {
        out = out.replace(scriptMatch[0], '');
        out = out.replace('</body>', `  ${scriptMatch[0]}\n  </body>`);
      }

      return out;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [react(), tailwindcss(), hopwebClassicHtmlPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'import.meta.env.VITE_HOPWEB': JSON.stringify('true'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist-hopweb',
      emptyOutDir: true,
      cssCodeSplit: false,
      target: 'es2018',
      rollupOptions: {
        output: {
          format: 'iife',
          name: 'KingsReloadApp',
          entryFileNames: 'assets/app.js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          inlineDynamicImports: true,
        },
      },
    },
  };
});
