// Logger con soporte multiplataforma
const os = require('os');

const isWindows = os.platform() === 'win32';

// Emojis para Mac/Linux, símbolos ASCII para Windows
const icons = isWindows ? {
  app: '[APP]',
  init: '[INIT]',
  network: '[NET]',
  load: '[LOAD]',
  verify: '[CHK]',
  success: '[OK]',
  error: '[ERR]',
  warning: '[WARN]',
  retry: '[RETRY]',
  reload: '[RELOAD]',
  timeout: '[TIME]',
  fatal: '[FATAL]'
} : {
  app: '🎯',
  init: '🚀',
  network: '🌐',
  load: '📄',
  verify: '🔍',
  success: '✅',
  error: '❌',
  warning: '⚠️',
  retry: '⚠️',
  reload: '🔄',
  timeout: '⏱️',
  fatal: '❌'
};

function log(type, tag, message) {
  const icon = icons[type] || '';
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${icon} [${tag}] ${message}`);
}

module.exports = {
  app: (msg) => log('app', 'APP', msg),
  init: (msg) => log('init', 'INIT', msg),
  network: (msg) => log('network', 'NETWORK', msg),
  load: (msg) => log('load', 'LOAD', msg),
  verify: (msg) => log('verify', 'VERIFY', msg),
  success: (msg) => log('success', 'SUCCESS', msg),
  error: (msg) => log('error', 'ERROR', msg),
  warning: (msg) => log('warning', 'WARNING', msg),
  retry: (msg) => log('retry', 'RETRY', msg),
  reload: (msg) => log('reload', 'RELOAD', msg),
  timeout: (msg) => log('timeout', 'TIMEOUT', msg),
  fatal: (msg) => log('fatal', 'FATAL', msg),
  raw: console.log
};


