const vscode = require('vscode');

function t(message, ...args) {
  if (vscode.l10n && typeof vscode.l10n.t === 'function') return vscode.l10n.t(message, ...args);
  return message.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]));
}

module.exports = { t };
