const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBuildTutorPayload() {
  const source = fs.readFileSync(path.join(__dirname, '../pages/tutor/index.js'), 'utf8');
  const sandbox = {
    require: (modulePath) => require(path.join(__dirname, '../pages/tutor', modulePath)),
    module: { exports: {} },
    Page: () => {},
    console
  };

  vm.runInNewContext(`${source}\nmodule.exports = { buildTutorPayload };`, sandbox);
  return sandbox.module.exports.buildTutorPayload;
}

test('检查错误将句子提交为 sentence_correction', () => {
  const buildTutorPayload = loadBuildTutorPayload();

  assert.equal(
    buildTutorPayload('correction', 'application', 'He go.', 'r1').coachMode,
    'sentence_correction'
  );
});

test('升级表达将句子提交为 sentence_upgrade', () => {
  const buildTutorPayload = loadBuildTutorPayload();

  assert.equal(
    buildTutorPayload('upgrade', 'application', 'I am glad.', 'r2').coachMode,
    'sentence_upgrade'
  );
});
