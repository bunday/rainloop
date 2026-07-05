import { startServer } from './server.ts';
import { ensureDirs } from './storage.ts';

await ensureDirs();
startServer();
