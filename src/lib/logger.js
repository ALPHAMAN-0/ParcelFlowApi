import { isTest } from '../config/env.js';

// Minimal structured (JSON-lines) logger. One line per event, machine-parseable,
// and silent under test so the runner output stays readable. Secrets are never
// passed in here — callers log identifiers, never tokens or passwords.
function write(level, message, fields = {}) {
  if (isTest) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};