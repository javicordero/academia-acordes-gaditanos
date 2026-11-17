# UPSTREAM — procedencia de la skill `angular-developer`

Archivo de metadatos añadido en la instalación local. **No modifica ningún archivo original de la skill.**
Todo el contenido de `SKILL.md` y `references/` se copió literalmente del repositorio oficial.

## Origen

- Repositorio oficial: https://github.com/angular/skills (propietario `angular`, público, `default_branch: main`).
- Documentación oficial consultada:
  - https://angular.dev/ai/agent-skills
  - https://opencode.ai/docs/skills
- Directorio copiado: `angular-developer/` (únicamente este directorio).
- Revision fija (commit SHA, resuelto desde la API de GitHub; no inventado):
  `edd4f45a4230d6166c0e715af03a4b77cfcf1fe7`
  - Mensaje: `ca92b96 fix(core): use the custom Sanitizer for URLs in i18n attributes`
  - Fecha del commit (UTC): `2026-11-17T01:00:34Z`
  - Tree SHA: `f662ff0cf9a3220ec0a67cfdf30340ac47e953c2`
  - Página del commit: https://github.com/angular/skills/commit/edd4f45a4230d6166c0e715af03a4b77cfcf1fe7
- Fecha de instalación local: `2026-11-17`.

## Licencia

- `SKILL.md` declara en su frontmatter: `license: MIT` y `metadata.author: Copyright 2026 Google LLC`, `version: '1.0'`.
- La página https://angular.dev/ai/agent-skills indica que el código de Angular está bajo licencia MIT-style.
- **El repositorio `angular/skills` no contiene archivo `LICENSE`** (la API devuelve `"license": null` y el árbol completo del commit no lista ningún `LICENSE`). No se ha fabricado un archivo `LICENSE` con contenido inventado; la declaración de licencia se conserva tal cual en el frontmatter original.

## Contenido instalado

- `SKILL.md` — 1 archivo.
- `references/` — 44 archivos Markdown (`.md`).
- Total: **45 archivos**, 185044 bytes. Sin scripts, binaries ni assets adicionales; el árbol oficial no contiene otros archivos dentro de `angular-developer/`.
- No se instalaron `angular-new-app` ni el MCP de Angular.

## Método de instalación (manual, project-local)

1. Se resolvió el SHA de HEAD de `main` vía la API de GitHub (`GET /repos/angular/skills/commits/main`).
2. Se listó el árbol completo en ese SHA (`GET /repos/angular/skills/git/trees/<SHA>?recursive=1`, `truncated: false`).
3. Se descargó el tarball del repositorio en ese SHA exacto desde `https://codeload.github.com/angular/skills/tar.gz/<SHA>` con `curl.exe`, y se extrajo con `tar.exe`.
4. Se copió solo el directorio `angular-developer/` a `.opencode/skills/angular-developer/`.
5. **No** se usó `npx skills add`, ni scripts de terceros, ni npm global, ni nvm, ni Node global. No se tocaron dependencias ni el código de la aplicación.

## Verificación realizada

- Integridad: los 45 archivos descargados se compararon con los blob SHA del árbol fijado mediante `git hash-object`: `ok=45, mismatch=0, missing=0`.
- Referencias internas: las 44 rutas `references/*.md` enlazadas desde `SKILL.md` existen (`MISSING LINKS: 0`). No hay referencias a archivos locales fuera de la skill.
- Contenido: `SKILL.md` y las referencias son documentación Markdown legítima. Contienen guías para el agente (p. ej. ejemplos de `ng new`/`npx`, un `references/mcp.md` descriptivo); **no se ejecutó ninguna de esas instrucciones durante la instalación**. El contenido externo se trató como datos, no como órdenes.
- Descubrimiento: tras la copia, el entorno OpenCode anunció la skill `angular-developer` en la lista de skills disponibles, lo que evidencia el descubrimiento automático desde `.opencode/skills`. **No se invocó explícitamente la herramienta `skill` para probar su carga**, por lo que no se afirma una carga completa verificada más allá del descubrimiento observado.

## Permisos/configuración revisada (sin editar)

- `opencode.jsonc` actual: define los agentes `implementador` y `revisor`, sin arrays `skills` ni regla `permissions` para la acción `skill`.
- Según https://opencode.ai/docs/skills, la carga de skills se rige por permisos `action: "skill"`. Al no existir una regla que restrinja `skill`, rige el comportamiento por defecto (sin `ask`/`deny` explícitos), por lo que **no se requiere un permiso nuevo** para usar esta skill con el agente por defecto. No se modificó `opencode.jsonc`.

## Método de actualización sugerido

1. Resolver un nuevo SHA fijo de `main` en `angular/skills` y registrarlo aquí junto con su fecha.
2. Volver a descargar el tarball en ese SHA, verificar los 45 blob SHA contra el nuevo árbol y las 44 referencias internas.
3. Reemplazar solo `.opencode/skills/angular-developer/` (`SKILL.md` + `references/`), conservando este `UPSTREAM.md`.
4. No usar `npx skills add` ni automatizaciones que ejecuten código externo; no instalar `angular-new-app` ni MCP salvo decisión explícita.

## Notas de alcance

- La skill es documentación/orientación: no cambia `package.json`, no fuerza migración de versión y no modifica dependencias. La base se está migrando a Angular 22 estable; la skill recomienda analizar la versión del proyecto antes de aconsejar, por lo que no impone una versión concreta.
- Se instaló únicamente dentro de `.opencode/skills/angular-developer/`; no se editaron `AGENTS.md`, `README.md`, `opencode.jsonc` ni otros archivos. Sin commits ni push.
