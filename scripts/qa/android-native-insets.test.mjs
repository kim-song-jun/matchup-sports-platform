import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Execute the Java-generated production script, including the early-document lifecycle boundary.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = mkdtempSync(path.join(tmpdir(), 'teameet-native-insets-'));
const executable = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name;
let scripts;
try {
  const probe = path.join(temp, 'InsetsProbe.java');
  writeFileSync(probe, `package kr.co.teameet;
public class InsetsProbe {
  public static void main(String[] args) {
    System.out.println(NativeInsetsScript.create(48, 0, false));
    System.out.println(NativeInsetsScript.create(48, 378, true));
  }
}`);
  execFileSync(executable('javac'), ['-d', temp,
    path.join(repo, 'apps/v1_android/app/src/main/java/kr/co/teameet/NativeInsetsScript.java'), probe]);
  scripts = execFileSync(executable('java'), ['-cp', temp, 'kr.co.teameet.InsetsProbe'], { encoding: 'utf8' }).trim().split(/\r?\n/);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

function root() {
  const properties = {};
  return { properties, style: { setProperty(key, value) { properties[key] = value; } }, dataset: {} };
}

test('insets before document creation do not throw; the later publish restores state', () => {
  const document = { documentElement: null };
  const context = vm.createContext({ document });
  assert.doesNotThrow(() => vm.runInContext(scripts[0], context));
  document.documentElement = root();
  vm.runInContext(scripts[0], context);
  assert.deepEqual(document.documentElement.properties, {
    '--teameet-native-safe-bottom': '48px',
    '--v1-shell-safe-bottom': '48px',
    '--teameet-native-keyboard-inset': '0px',
  });
  assert.deepEqual(document.documentElement.dataset, { teameetNativeApp: 'android', teameetNativeKeyboard: 'closed' });
});

test('keyboard updates remain correct across document recreation', () => {
  const document = { documentElement: root() };
  const context = vm.createContext({ document });
  vm.runInContext(scripts[1], context);
  assert.equal(document.documentElement.properties['--teameet-native-keyboard-inset'], '378px');
  assert.equal(document.documentElement.dataset.teameetNativeKeyboard, 'open');
  document.documentElement = null;
  assert.doesNotThrow(() => vm.runInContext(scripts[1], context));
  document.documentElement = root();
  vm.runInContext(scripts[0], context);
  assert.equal(document.documentElement.properties['--teameet-native-keyboard-inset'], '0px');
  assert.equal(document.documentElement.dataset.teameetNativeKeyboard, 'closed');
});
