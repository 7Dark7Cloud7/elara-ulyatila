import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const run = (cmd, cwd = root) => {
  const res = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit', env });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

// npm/npx em Git Bash podem não fazer nada em silêncio: chamamos os binários
// directamente pelo node.
const nodeBin = (pkg, file) =>
  `"${process.execPath}" "${join(root, 'node_modules', pkg, file)}"`;

// O gradlew.bat precisa de uma JVM antes de ler o gradle.properties. Este PC
// não tem JAVA_HOME no ambiente, por isso usamos o JBR do Android Studio.
const jbr = 'C:/Program Files/Android/Android Studio/jbr';
const env = { ...process.env };
if (!env.JAVA_HOME && existsSync(join(jbr, 'bin', 'java.exe'))) env.JAVA_HOME = jbr;

const android = join(root, 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const mode = process.argv[2] ?? 'release';

run(nodeBin('vite', 'bin/vite.js') + ' build');
run(nodeBin('@capacitor/cli', 'bin/capacitor') + ' sync android');
if (mode === 'sync') process.exit(0);

const task = mode === 'debug' ? 'assembleDebug' : 'assembleRelease';
run(`${gradlew} ${task} --console=plain --no-daemon`, android);

const kind = mode === 'debug' ? 'debug' : 'release';
const apk = join(android, 'app', 'build', 'outputs', 'apk', kind, `app-${kind}.apk`);
if (!existsSync(apk)) {
  console.error('O Gradle terminou mas não deixou APK em', apk);
  process.exit(1);
}
const outDir = join(root, 'build-artifacts');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `trajectoria-${version}-${kind}.apk`);
copyFileSync(apk, out);
console.log('\nAPK pronto:', out);
