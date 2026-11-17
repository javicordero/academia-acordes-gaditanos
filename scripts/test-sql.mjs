#!/usr/bin/env node
// Runner portable de la suite SQL/RLS de Supabase, sin Docker ni `psql`.
//
// Levanta PGlite en memoria, crea un bootstrap mínimo y fiel a lo que usan las
// pruebas (`auth.users`, `auth.uid()` leyendo `request.jwt.claims` y los roles
// anon/authenticated/service_role), aplica las migraciones de
// `supabase/migrations/` y ejecuta los scripts de `supabase/tests/`.
//
// LIMITADO A LÓGICA SQL/RLS: NO reproduce Supabase, ni GoTrue/Auth real, ni
// PostgREST, ni sus grants por defecto, ni el esquema `auth` completo. Una
// ejecución verde aquí no demuestra que el despliegue en Supabase se comporte
// igual; eso requiere el Supabase local (Docker + CLI) o un proyecto revisado.
//
// El runner no lee `.env` ni hace peticiones de red. Cualquier error termina con
// código de salida 1.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const testsDir = path.join(repoRoot, 'supabase', 'tests');

// Metacomandos de psql admitidos en los scripts de prueba. La clave y el valor
// se comparan con la línea ya recortada; el valor ocupa el lugar del comando en
// el texto que se envía a PGlite. Cualquier otro metacomando es un error, para
// no saltarse en silencio una directiva que el runner no sabe reproducir.
const ALLOWED_METACOMMANDS = new Map([['\\set ON_ERROR_STOP on', '']]);

const BOOTSTRAP = String.raw`
  create schema auth;

  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  -- Sustituto mínimo de auth.users: solo las columnas que usan las pruebas.
  create table auth.users (
    id uuid primary key,
    email text unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- Equivalente simplificado de auth.uid() de Supabase, que resuelve el sujeto
  -- del JWT desde request.jwt.claims. No valida ni verifica tokens.
  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid;
  $$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant select on auth.users to anon, authenticated, service_role;
`;

// Campos de error de PostgreSQL que se muestran en consola.
const ERROR_FIELDS = ['severity', 'code', 'detail', 'hint', 'where', 'position'];

const BOM = String.fromCharCode(0xfeff);

// Avanza el estado de delimitación a través de `text`. Devuelve el estado final
// y, si termina dentro de un bloque `$$`/`$etiqueta$`, la etiqueta abierta.
// Estado: null fuera; "'" dentro de un literal; "$$", "$tag$" dentro de un bloque.
function advanceState(initial, text) {
  let state = initial;
  let index = 0;

  while (index < text.length) {
    if (state === "'") {
      if (text[index] === "'") {
        if (text[index + 1] === "'") {
          index += 2;
          continue;
        }
        state = null;
      }
      index += 1;
      continue;
    }

    if (state !== null) {
      if (text.startsWith(state, index)) {
        index += state.length;
        state = null;
        continue;
      }
      index += 1;
      continue;
    }

    if (text[index] === "'") {
      state = "'";
      index += 1;
      continue;
    }

    if (text[index] === '$') {
      const rest = text.slice(index);
      if (rest.startsWith('$$')) {
        state = '$$';
        index += 2;
        continue;
      }
      const match = /^\$[A-Za-z_][A-Za-z_0-9]*\$/.exec(rest);
      if (match) {
        state = match[0];
        index += match[0].length;
        continue;
      }
    }

    index += 1;
  }

  return state;
}

/**
 * Traduce un script `.psql` a SQL ejecutable por PGlite: elimina el BOM inicial dice
 * solo sustituye los metacomandos `\` de la lista blanca cuando abren una línea
 * fuera de un bloque `$$`/`$etiqueta$` o de un literal de cadena.
 */
function formatPsqlFile(fileName, text) {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const lines = source.split(/\r?\n/);
  const output = [];
  let state = null;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trimStart();

    if (state === null && line.startsWith('\\')) {
      const command = line.trimEnd();
      const replacement = ALLOWED_METACOMMANDS.get(command);
      if (replacement === undefined) {
        throw new Error(
          `${fileName}:${index + 1}: metacomando no admitido "${command}". ` +
            'Amplía la lista blanca en scripts/test-sql.mjs tras revisarlo.',
        );
      }
      output.push(replacement);
      continue;
    }

    output.push(rawLine);
    state = advanceState(state, rawLine);
  }

  if (state !== null) {
    throw new Error(`${fileName}: bloque o cadena sin cerrar al final del script (${state})`);
  }

  return output.join('\n');
}

async function listFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

async function main() {
  const migrations = await listFiles(migrationsDir, '.sql');
  const tests = await listFiles(testsDir, '.psql');

  if (migrations.length === 0) throw new Error(`no hay migraciones .sql en ${migrationsDir}`);
  if (tests.length === 0) throw new Error(`no hay pruebas .psql en ${testsDir}`);

  // PGlite en memoria; los recursos WASM se resuelven desde el paquete npm
  // declarado en devDependencies, sin base externa ni descargas.
  const db = new PGlite({ dataDir: 'memory://' });
  try {
    await db.exec(BOOTSTRAP);

    for (const name of migrations) {
      await db.exec(await readFile(path.join(migrationsDir, name), 'utf8'));
      console.log(`ok: migración ${name}`);
    }

    for (const name of tests) {
      const script = formatPsqlFile(name, await readFile(path.join(testsDir, name), 'utf8'));
      await db.exec(script);
      console.log(`ok: pruebas ${name}`);
    }

    console.log('');
    console.log('Suite SQL/RLS superada.');
    console.log('LIMITADO A LÓGICA SQL/RLS: no es Supabase, Auth ni PostgREST reales.');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('FALLO en la suite SQL/RLS:');
  for (const key of ERROR_FIELDS) {
    if (error?.[key]) console.error(`${key}: ${error[key]}`);
  }
  if (!error?.message) console.error(error);
  process.exitCode = 1;
});
