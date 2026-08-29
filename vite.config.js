import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const MAX_GEMINI_UPLOAD_BYTES = 55 * 1024 * 1024;

const readRequestBody = request => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  request.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_GEMINI_UPLOAD_BYTES) {
      reject(new Error('Tệp vượt giới hạn 55 MB của máy chủ.'));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => resolve(Buffer.concat(chunks)));
  request.on('error', reject);
});

const writeJson = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
};

const geminiServerPlugin = () => ({
  name: 'ifa-gemini-server-proxy',
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const requestUrl = new URL(request.url || '/', 'http://localhost');
      if (!requestUrl.pathname.startsWith('/api/gemini/')) return next();

      const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
      if (requestUrl.pathname === '/api/gemini/status') {
        writeJson(response, 200, { available: true, configured: Boolean(apiKey), mode: 'server' });
        return;
      }
      if (!apiKey) {
        writeJson(response, 503, { error: { message: 'AI Studio chưa cấu hình GEMINI_API_KEY phía máy chủ.' } });
        return;
      }

      try {
        if (requestUrl.pathname === '/api/gemini/files/upload') {
          if (request.method !== 'POST') {
            writeJson(response, 405, { error: { message: 'Phương thức không được hỗ trợ.' } });
            return;
          }
          const fileBytes = await readRequestBody(request);
          const mimeType = String(requestUrl.searchParams.get('mimeType') || 'application/pdf').slice(0, 120);
          const displayName = String(requestUrl.searchParams.get('displayName') || 'IFA Thesis PDF').slice(0, 240);
          const startResponse = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
              'X-Goog-Upload-Protocol': 'resumable',
              'X-Goog-Upload-Command': 'start',
              'X-Goog-Upload-Header-Content-Length': String(fileBytes.length),
              'X-Goog-Upload-Header-Content-Type': mimeType
            },
            body: JSON.stringify({ file: { displayName } })
          });
          if (!startResponse.ok) {
            const errorText = await startResponse.text();
            response.statusCode = startResponse.status;
            response.setHeader('Content-Type', startResponse.headers.get('content-type') || 'application/json');
            response.end(errorText);
            return;
          }
          const uploadUrl = startResponse.headers.get('x-goog-upload-url');
          if (!uploadUrl) throw new Error('Gemini không cung cấp URL tải tệp lên.');
          const finalizeResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type': mimeType,
              'X-Goog-Upload-Offset': '0',
              'X-Goog-Upload-Command': 'upload, finalize'
            },
            body: fileBytes
          });
          const resultText = await finalizeResponse.text();
          response.statusCode = finalizeResponse.status;
          response.setHeader('Content-Type', finalizeResponse.headers.get('content-type') || 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(resultText);
          return;
        }

        const upstreamPath = requestUrl.pathname.slice('/api/gemini/'.length);
        const allowedPath = /^(v1beta\/models\/[^/]+(?::generateContent)?|v1beta\/files\/[^/]+)$/u.test(upstreamPath);
        if (!allowedPath || !['GET', 'POST'].includes(request.method || 'GET')) {
          writeJson(response, 404, { error: { message: 'Đường dẫn Gemini không được hỗ trợ.' } });
          return;
        }
        const requestBody = request.method === 'POST' ? await readRequestBody(request) : undefined;
        const upstreamResponse = await fetch(`https://generativelanguage.googleapis.com/${upstreamPath}${requestUrl.search}`, {
          method: request.method,
          headers: {
            'Content-Type': request.headers['content-type'] || 'application/json',
            'x-goog-api-key': apiKey
          },
          body: requestBody?.length ? requestBody : undefined
        });
        const upstreamBody = await upstreamResponse.text();
        response.statusCode = upstreamResponse.status;
        response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        const retryAfter = upstreamResponse.headers.get('retry-after');
        if (retryAfter) response.setHeader('Retry-After', retryAfter);
        response.end(upstreamBody);
      } catch (error) {
        writeJson(response, 500, { error: { message: error?.message || 'Lỗi máy chủ Gemini.' } });
      }
    });
  }
});

export default defineConfig({
  base: './',
  plugins: [react(), geminiServerPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900
  }
});
