import { buildApp } from './adapters/driving/http/app';

const port = Number(process.env['PORT'] ?? 3000);
await buildApp().listen({ port, host: '0.0.0.0' });
console.log(`api listening on :${port}`);
