import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', windowsHide: true }),
];

function stopChildren() {
  children.forEach((child) => { if (!child.killed) child.kill(); });
}

children.forEach((child) => child.on('exit', (code) => {
  if (code && code !== 0) { stopChildren(); process.exitCode = code; }
}));

process.on('SIGINT', () => { stopChildren(); process.exit(0); });
process.on('SIGTERM', () => { stopChildren(); process.exit(0); });
