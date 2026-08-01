import { createApp } from './app.js';
import { loadLocalEnv } from './env.js';

loadLocalEnv();
const port = Number(process.env.PORT || 8787);
createApp().listen(port, '0.0.0.0', () => console.log(`OP Visit API listening on http://localhost:${port}`));
