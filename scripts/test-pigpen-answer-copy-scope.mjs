import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('public/js/PigPenCreator.js', 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0);
  const rest = source.slice(start);
  return rest.slice(0, rest.slice(1).search(/^(?:async )?function /m) + 1);
}
const context = vm.createContext({
  console, SESSION_TITLE_DEFAULT: 'Sesión', structuralView: { enabled: false },
  state: { activeSessionId: 'a', activeTopicId: 'same', activeSessionMeta: { title: 'A' },
    topics: [{ id: 'same', academicNumber: 1 }, { id: 'second', academicNumber: 2 }],
    sessions: [{ id: 'b', title: 'B' }] },
  renderTopicList() {}, syncActionButtons() {}, setStatus() {},
  flushStructuralEdits: async () => {}, flushPendingTopicSave: async () => {},
  confirmRealSessionAction: () => true,
  selectedStructuralGroup: () => ({ materia: 'Inglés', grado: 'Segundo', topics: [
    { sessionId: 'a', topicId: 'same' }, { sessionId: 'a', topicId: 'second' }, { sessionId: 'b', topicId: 'same' }
  ] }),
  getLatestTopicForAnswerCopy: topic => ({ ...topic, origin: 'a' }),
  fetchSessionTopics: async id => { assert.equal(id, 'b'); return [{ id: 'same', origin: 'b', academicNumber: 3 }]; },
  copyAnswerKeyToClipboard: async payload => { context.copied = payload; }
});
vm.runInContext(['copyTopicAnswers', 'copyAllTopicAnswers'].map(extract).join('\n'), context);
await context.copyAllTopicAnswers();
assert.equal(context.copied.topics.length, 2);
context.structuralView.enabled = true;
await context.copyAllTopicAnswers();
assert.equal(context.copied.topics.length, 3);
assert.equal(context.copied.topics[2].origin, 'b');
assert.equal(context.copied.sessionTitle, 'Inglés · Segundo');
await context.copyTopicAnswers('second');
assert.equal(context.copied.topics.length, 1);
assert.equal(context.copied.topics[0].id, 'second');
await context.copyTopicAnswers('same', 'b');
assert.equal(context.copied.topics.length, 1);
assert.equal(context.copied.topics[0].origin, 'b');
assert.equal(context.copied.sessionTitle, 'B');
assert.equal(context.state.activeSessionId, 'a');
assert.equal(context.state.activeTopicId, 'same');
assert.equal(context.state.answerCopyInFlight, false);
console.log('PASS answer copy: full real session, full structural group, individual topic and composite source without navigation');
