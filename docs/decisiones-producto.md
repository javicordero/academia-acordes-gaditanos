# Decisiones de producto (registro de alcance)

Registro breve de precisiones de producto acordadas con el usuario. Recoge un
hecho **confirmado** y varias cuestiones **pendientes**. No es un plan cerrado,
no decide el modelo definitivo y no implementa nada: no toca la base de datos,
el código, las migraciones ni las pruebas. No reproduce el plan privado
(`docs/plan-maestro.md`), ni datos o cursos reales del usuario, ni precios,
temario o biografía.

## Confirmado por el usuario

- **Validación manual:** el usuario ha probado la creación de un curso y de
  bloques, y la estructura inicial resulta funcional para ese uso manual.
  Esta comprobación se refiere a esa operación concreta de alta de curso y
  bloques; no se extiende a otros flujos.

## Carácter provisional del modelo

- La organización **cursos → bloques → lecciones** y el modelo pedagógico /
  editorial que la sostiene son **provisionales**.
- Están pendientes de **revisión futura antes de consolidar el catálogo y antes
  del lanzamiento**. Revisar no significa rediseñar ahora: el rediseño no se
  aborda en esta fase.
- El **estilo visual provisional ya acordado** (`AGENTS.md`) es una cuestión
  distinta: no debe confundirse ni converger con la decisión del modelo
  definitivo de cursos.

## Límites de la validación

- La prueba manual del usuario **no demuestra seguridad ni comportamiento de
  RLS**: eso sigue dependiendo de las migraciones y pruebas de SQL, y de la
  verificación real con Supabase, según `docs/arquitectura-datos.md`.
- Tampoco acredita la cobertura **E2E de todos los campos**: no se da por
  validado ningún recorrido completo ni todo el formulario por el hecho de que
  se haya creado un curso y bloques manualmente.

## Criterio técnico recomendado para futuras evoluciones

Cuando el modelo se revise, cualquier evolución del esquema debe:

- **preservar los identificadores** de cursos y lecciones, el progreso, los
  accesos y los pagos;
- hacerse mediante **migraciones versionadas y sus pruebas** correspondientes;
- **no rehacer ni borrar contenido real** para adaptarlo a un rediseño.

Esto es un **criterio técnico recomendado**, no una nueva decisión de negocio
ni un calendario comprometido.

## Pendiente de revisión futura (sin decisiones cerradas)

Agrupación y módulos, temario, plantilla de lección, metadatos y necesidades
del profesor. Se enumeran como temas a revisar; no se fija aquí su forma,
alcance ni contenido.

## Límites y fecha

- Este documento **no cambia** `AGENTS.md`, `README.md` ni
  `docs/arquitectura-datos.md`, y no modifica migraciones, SQL ni código.
- Registrado el **2026-11-17** (fecha del entorno de trabajo). Si esa fecha no
  se considera válida como evidencia, debe entenderse como la del registro y no
  como una fecha de decisión de producto.
