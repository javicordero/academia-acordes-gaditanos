/**
 * Textos orientativos de las páginas legales de la academia.
 *
 * No son textos jurídicos validados: los marcadores entre corchetes deben
 * sustituirse por datos reales y el contenido debe revisarse antes de
 * publicarlo. No se recogen aquí datos personales, fiscales ni de contacto
 * reales, ni precios o decisiones comerciales pendientes.
 */
export type LegalPageKey =
  | 'aviso-legal'
  | 'privacidad'
  | 'cookies'
  | 'terminos'
  | 'reembolsos';

export type LegalBlock =
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] };

export interface LegalSubsection {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalSection {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
  readonly subsections?: readonly LegalSubsection[];
}

export interface LegalPageContent {
  readonly key: LegalPageKey;
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly sections: readonly LegalSection[];
}

export const LEGAL_NOTICE =
  'Plantilla orientativa: revisar antes de publicación. Este texto no constituye asesoramiento jurídico y debe ser revisado por profesional cualificado.';

const p = (text: string): LegalBlock => ({ kind: 'paragraph', text });
const list = (...items: string[]): LegalBlock => ({ kind: 'list', items });

export const LEGAL_PAGES: Record<LegalPageKey, LegalPageContent> = {
  'aviso-legal': {
    key: 'aviso-legal',
    eyebrow: 'Información legal',
    title: 'Aviso legal',
    intro:
      'Datos de identificación y condiciones generales de uso de este sitio. Sustituye los marcadores entre corchetes por información real validada.',
    sections: [
      {
        id: 'identificacion',
        heading: 'Identificación del titular',
        blocks: [
          p('Titular del servicio: [Titular].'),
          p('Documento de identificación fiscal: [CIF/NIF].'),
          p('Domicilio: [Domicilio].'),
          p('Correo de contacto: [Correo de contacto].'),
          p(
            'Los datos anteriores son marcadores de plantilla. Deben sustituirse por los datos reales y revisarse antes de publicar esta página.',
          ),
        ],
      },
      {
        id: 'condiciones-uso',
        heading: 'Condiciones de uso',
        blocks: [
          p(
            'El acceso a la academia se ofrece para uso personal. No se permite utilizar el servicio para actividades ilícitas, intentar acceder a cursos sin derecho o interferir en su funcionamiento.',
          ),
          p(
            'La disponibilidad de cursos y lecciones puede variar: no se garantiza disponibilidad perpetua ni funcionamiento ininterrumpido.',
          ),
        ],
      },
      {
        id: 'contenidos-derechos',
        heading: 'Contenidos y derechos',
        blocks: [
          p(
            'Los textos, materiales y grabaciones de la academia pueden incluir contenidos propios y de terceros. Sus derechos y autorizaciones deben revisarse antes de publicar cada curso.',
          ),
          p(
            'No se concede ningún derecho de uso de los materiales más allá del acceso asociado a la cuenta y, cuando proceda, al curso adquirido.',
          ),
        ],
      },
      {
        id: 'contacto-aviso',
        heading: 'Contacto e incidencias',
        blocks: [
          p(
            'Para consultas relacionadas con este sitio puedes escribir a [Correo de contacto].',
          ),
        ],
      },
    ],
  },
  privacidad: {
    key: 'privacidad',
    eyebrow: 'Protección de datos',
    title: 'Política de privacidad',
    intro:
      'Información orientativa sobre el tratamiento de datos de la academia. Las bases jurídicas y los plazos definitivos se validarán antes de publicar.',
    sections: [
      {
        id: 'responsable',
        heading: 'Responsable del tratamiento',
        blocks: [
          p(
            'Responsable: [Titular], con [CIF/NIF] y domicilio en [Domicilio].',
          ),
          p(
            'Contacto para asuntos de protección de datos: [Correo de contacto].',
          ),
          p(
            'La identidad del responsable y sus datos reales se confirmarán antes de publicar esta política.',
          ),
        ],
      },
      {
        id: 'finalidades',
        heading: 'Finalidades y legitimación',
        blocks: [
          p(
            'A continuación se describen las finalidades previstas con carácter orientativo. La base que corresponda a cada tratamiento se confirmará en la revisión legal.',
          ),
        ],
        subsections: [
          {
            id: 'finalidad-cuenta',
            heading: 'Cuenta de usuario',
            blocks: [
              p(
                'Gestión del registro, la autenticación y el mantenimiento de la cuenta.',
              ),
              p(
                'Legitimación orientativa: ejecución del contrato o aplicación de medidas precontractuales, según el caso.',
              ),
            ],
          },
          {
            id: 'finalidad-compra',
            heading: 'Compra y acceso',
            blocks: [
              p(
                'Gestión del pedido, verificación del pago y concesión del derecho de acceso al curso adquirido.',
              ),
              p(
                'Legitimación orientativa: ejecución del contrato y cumplimiento de obligaciones legales en materia fiscal y contable.',
              ),
            ],
          },
          {
            id: 'finalidad-progreso',
            heading: 'Progreso de aprendizaje',
            blocks: [
              p(
                'Registro manual de lecciones completadas y de la actividad de aprendizaje dentro de la cuenta.',
              ),
              p(
                'Legitimación orientativa: ejecución del contrato y prestación del servicio solicitado.',
              ),
            ],
          },
          {
            id: 'finalidad-dudas',
            heading: 'Comentarios y dudas',
            blocks: [
              p(
                'Atención de dudas y mensajes asociados a una lección o al uso de la academia.',
              ),
              p(
                'Legitimación orientativa: relación contractual o interés legítimo, según corresponda.',
              ),
            ],
          },
        ],
      },
      {
        id: 'destinatarios',
        heading: 'Destinatarios',
        blocks: [
          p(
            'Intervienen como proveedores técnicos: Supabase (base de datos y autenticación), Stripe (pagos) y Bunny Stream (alojamiento y entrega de vídeo).',
          ),
          p(
            'De forma opcional, Google Analytics 4 (GA4) puede intervenir como analítica propia de Acordes Gaditanos, distinta de la del cancionero: solo se activa con consentimiento previo y si existe un ID configurado.',
          ),
          p(
            'No se comparten claves, tokens ni secretos en el cliente. La condición de cada proveedor y la relación de encargados de tratamiento se confirmarán en la revisión legal.',
          ),
        ],
      },
      {
        id: 'conservacion',
        heading: 'Conservación',
        blocks: [
          p(
            'Los datos se conservarán mientras sean necesarios para prestar el servicio, atender incidencias y cumplir obligaciones legales. Los plazos concretos se fijarán antes de la publicación.',
          ),
        ],
      },
      {
        id: 'derechos',
        heading: 'Derechos (ARCOLP)',
        blocks: [
          list(
            'Acceso.',
            'Rectificación.',
            'Cancelación o supresión.',
            'Oposición.',
            'Limitación del tratamiento.',
            'Portabilidad.',
          ),
          p(
            'Puedes ejercerlos, cuando proceda, escribiendo a [Correo de contacto]. La autoridad de control competente se indicará tras la revisión legal.',
          ),
        ],
      },
    ],
  },
  cookies: {
    key: 'cookies',
    eyebrow: 'Política de cookies',
    title: 'Política de cookies',
    intro:
      'Qué son las cookies y cómo se gestionan en la academia. El inventario real de cookies se documentará antes de publicar esta política.',
    sections: [
      {
        id: 'que-son',
        heading: 'Qué son las cookies',
        blocks: [
          p(
            'Las cookies son pequeños archivos que un sitio puede almacenar en tu navegador. Otras tecnologías similares pueden cumplir funciones parecidas.',
          ),
          p(
            'Esta página es informativa: por sí sola no instala cookies ni activa servicios de medición.',
          ),
        ],
      },
      {
        id: 'categorias',
        heading: 'Categorías',
        blocks: [
          p(
            'Las categorías previstas se dividen en necesarias y opcionales. Solo las categorías opcionales requieren consentimiento previo.',
          ),
        ],
        subsections: [
          {
            id: 'categoria-necesarias',
            heading: 'Necesarias',
            blocks: [
              p(
                'Permiten funciones básicas, como mantener la sesión o recordar preferencias. Están siempre activas porque sin ellas el sitio no funcionaría como se espera.',
              ),
              p(
                'El inventario exacto de estas cookies se documentará antes de publicar la política.',
              ),
            ],
          },
          {
            id: 'categoria-analitica',
            heading: 'Analítica opcional',
            blocks: [
              p(
                'Categoría de medición de uso. Solo se activaría con tu consentimiento previo y podría rechazarse sin perder el acceso al sitio.',
              ),
              p(
                'Esta página no carga analítica ni servicios de medición por sí sola. El GA4 propio de Acordes Gaditanos, si se utiliza, se activa solo con consentimiento previo y con un ID configurado; sin consentimiento no se activa.',
              ),
              p(
                'Si se activa, se usan señales de Consent Mode v2 con finalidades publicitarias denegadas: no se habilitan publicidad ni personalización.',
              ),
            ],
          },
        ],
      },
      {
        id: 'eleccion',
        heading: 'Cómo aceptar, rechazar o cambiar tu elección',
        blocks: [
          p(
            'El sitio incorpora un banner de consentimiento con opciones para aceptar o rechazar las categorías opcionales.',
          ),
          p(
            'También puedes cambiar tu elección con el botón «Cambiar preferencias» de esta página o configurar tu navegador para bloquear o eliminar cookies.',
          ),
          p(
            'Las instrucciones concretas están en el banner de preferencias, ya disponible; desde él puedes revisar tus opciones en cualquier momento.',
          ),
        ],
      },
      {
        id: 'contacto-cookies',
        heading: 'Contacto',
        blocks: [
          p(
            'Para dudas sobre el uso de cookies puedes escribir a [Correo de contacto].',
          ),
        ],
      },
    ],
  },
  terminos: {
    key: 'terminos',
    eyebrow: 'Condiciones de compra',
    title: 'Términos de compra',
    intro:
      'Condiciones orientativas aplicables a la compra de cursos. No fijan precios, impuestos ni garantías pendientes de decisión.',
    sections: [
      {
        id: 'producto',
        heading: 'Producto y cuenta',
        blocks: [
          p(
            'La academia ofrece cursos de guitarra de compra individual. No hay suscripción: cada compra se refiere al curso indicado en el pedido.',
          ),
          p(
            'Una cuenta de usuario da acceso a los cursos para los que exista un derecho activo y a la lección de muestra disponible.',
          ),
        ],
      },
      {
        id: 'precio',
        heading: 'Precio e impuestos',
        blocks: [
          p(
            'El importe a pagar es el que se muestra en la pantalla de pago (checkout) antes de confirmar la compra. Los importes se calculan en servidor.',
          ),
          p(
            'El desglose de impuestos, descuentos, moneda y datos de facturación aplicables se detallará en el checkout y se validará antes de abrir las ventas.',
          ),
        ],
      },
      {
        id: 'activacion',
        heading: 'Activación del acceso',
        blocks: [
          p(
            'El acceso al curso se concede cuando el pago ha sido verificado mediante un webhook firmado y verificado en servidor.',
          ),
          p(
            'La página de confirmación que aparece en el navegador no concede acceso por sí sola.',
          ),
        ],
      },
      {
        id: 'duracion',
        heading: 'Duración y cambios del servicio',
        blocks: [
          p(
            'El acceso comprado no tiene una caducidad programada. Puede revocarse desde servidor por reembolso, contracargo u otra incidencia, según la política que se apruebe.',
          ),
          p(
            'No se promete disponibilidad perpetua del contenido ni del servicio. Los cambios relevantes se comunicarán a los alumnos por el cauce que se determine.',
          ),
        ],
      },
      {
        id: 'progreso',
        heading: 'Progreso y lecciones',
        blocks: [
          p(
            'El progreso se registra de forma manual: corresponde al alumno marcar las lecciones completadas.',
          ),
          p(
            'Cada lección requiere derecho activo sobre su curso, salvo la lección de muestra.',
          ),
        ],
      },
    ],
  },
  reembolsos: {
    key: 'reembolsos',
    eyebrow: 'Política de reembolsos',
    title: 'Reembolsos y desistimiento',
    intro:
      'Plantilla típica sobre desistimiento y devoluciones. No promete reembolso automático ni describe un procedimiento interno pendiente de aprobar.',
    sections: [
      {
        id: 'desistimiento',
        heading: 'Derecho de desistimiento',
        blocks: [
          p(
            'En compras a distancia puede aplicarse un plazo legal de desistimiento de catorce días naturales, cuando concurran las condiciones previstas en la normativa.',
          ),
          p(
            'Tratándose de contenidos digitales suministrados de inmediato, el derecho de desistimiento puede perderse si se ha solicitado expresamente el inicio inmediato del servicio y esa autorización se ha confirmado antes de comenzar.',
          ),
          p(
            'La aplicabilidad de estas reglas y su redacción definitiva se validarán legalmente antes de su publicación.',
          ),
        ],
      },
      {
        id: 'solicitudes',
        heading: 'Solicitudes de devolución',
        blocks: [
          p(
            'Para consultar una devolución o una incidencia de pago, escribe a [Correo de contacto] e indica el pedido afectado.',
          ),
          p(
            'No se ofrece reembolso automático. El procedimiento interno y los plazos de respuesta se definirán antes de abrir las ventas.',
          ),
        ],
      },
      {
        id: 'revocacion',
        heading: 'Devoluciones y revocación de acceso',
        blocks: [
          p(
            'Si se produce una devolución o un contracargo, el acceso al curso podrá revocarse desde servidor.',
          ),
          p(
            'No se describe aquí un procedimiento interno que todavía no está aprobado.',
          ),
        ],
      },
    ],
  },
};
