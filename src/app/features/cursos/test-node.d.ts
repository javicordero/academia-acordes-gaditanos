/** Declaración mínima para leer el SCSS declarado en las pruebas (Node/Vitest). */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
}
