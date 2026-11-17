import { access, copyFile, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const environmentsDirectory = join(repositoryRoot, 'src', 'environments');
const example = join(environmentsDirectory, 'environment.local.example.ts');
const target = join(environmentsDirectory, 'environment.local.ts');

await mkdir(environmentsDirectory, { recursive: true });

try {
  await access(target, constants.F_OK);
} catch {
  await copyFile(example, target);
  console.log(
    '[config] Creada src/environments/environment.local.ts desde la plantilla. ' +
      'Rellena la URL y la publishable key de Supabase para activar Auth.',
  );
}

const videoTarget = join(environmentsDirectory, 'video-demo.local.ts');
try {
  await access(videoTarget, constants.F_OK);
} catch {
  await copyFile(join(environmentsDirectory, 'video-demo.local.example.ts'), videoTarget);
  console.log('[config] Creada configuración local vacía de vídeos de prueba.');
}
