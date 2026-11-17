# Recepción del webhook: primera fase local

La función está **deshabilitada literalmente** y no está desplegada. Solo verifica
firmas con Stripe SDK 23.1.0 (misma versión que checkout; versión npm comprobada)
y registra eventos admitidos; no crea pagos, no modifica pedidos ni concede derechos.
No hay cuenta ni claves reales. El secreto se lee exclusivamente en servidor.

Se almacena el identificador y tipo, modo, hash SHA-256 de bytes originales y
referencias de sesión y pedido válidas cuando existan; no se guarda el payload,
correos, direcciones ni datos de pago. Un duplicado pendiente responde 503 para
reintento; solo uno marcado efectivamente procesado responde 200. Un mismo ID con
hash distinto falla sin sobrescribir. Otros tipos firmados reciben 200 sin registro.
Este comportamiento no está listo para producción: reembolsos y contracargos
precisan reglas antes de activarlo. Solo se admite modo test.

Antes de habilitar: implementar procesamiento transaccional idempotente, resolver
contrato de metadatos y comprobar sesión, pedido, usuario, importe, moneda y
estado de pago contra la fuente de verdad del servidor, así como repetición y
eventos fuera de orden. Una firma válida no acredita por sí sola el derecho.
No interpretar la página de éxito como concesión de acceso.

Una futura publicación necesitará `verify_jwt = false` **solo para esta función**,
pues Stripe no envía JWT de alumno; no cambiar la autenticación global. Revisar
antes la configuración, los tipos negativos y las pruebas en Supabase real. Las
pruebas locales usan SDK real para firmas sintéticas, mocks para E/S y PGlite
para SQL: no verifican el gateway ni un proveedor remoto.
