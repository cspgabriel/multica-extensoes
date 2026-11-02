'use strict';
const fs = require('node:fs');
const path = require('node:path');
function editOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Build incompatível: âncora de chat ausente ou ambígua: ' + before.slice(0, 80));
  return source.replace(before, after);
}
function patchChat(bundle) {
  const start = bundle.indexOf('function ChatInput(');
  const end = bundle.indexOf('\n//#endregion', start);
  if (start < 0 || end < start) throw new Error('Build incompatível: compositor do chat ausente.');
  let composer = bundle.slice(start, end);
  composer = editOnce(composer, '\tconst placeholder = agentAccessRevoked ?', `
  const desktopPluginDraft = (prompt) => {
    if (disabled || noAgent || submitting || gate.isBlocked() || editorDraftKeyRef.current !== draftKey) return false;
    const pending = editorRef.current?.flushPendingUpdate();
    if (pending != null) commitDraft(draftKey, pending);
    const current = editorRef.current?.getMarkdown() ?? useChatStore.getState().inputDrafts[draftKey] ?? '';
    const next = DesktopPluginModel.appendDraft(current, prompt);
    commitDraft(draftKey, next);
    editorRef.current?.adoptContent(next);
    setIsEmpty(!next.trim());
    editorRef.current?.focus();
    return true;
  };
\tconst placeholder = agentAccessRevoked ?`);
  composer = editOnce(composer, '\t\t\tchildren: [\n\t\t\t\tselectedProject &&', `\t\t\tchildren: [
        (0, import_jsx_runtime.jsx)(DesktopChatPlugins, { onUse: desktopPluginDraft, disabled: !!disabled || !!noAgent || submitting || !!isRunning && !allowSubmitWhileRunning, draftKey }),
\t\t\t\tselectedProject &&`);
  bundle = bundle.slice(0, start) + composer + bundle.slice(end);
  const source = ['chat-plugin-model.js', 'chat-plugins.js'].map(name => fs.readFileSync(path.join(__dirname, '../src/ui', name), 'utf8')).join('\n');
  return editOnce(bundle, 'var appRoutes = [{', source + '\nvar appRoutes = [{');
}
module.exports = { patchChat };
