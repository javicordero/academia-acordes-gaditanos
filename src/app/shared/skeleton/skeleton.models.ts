/** Variantes cerradas del esqueleto: cada una reserva la geometría del contenido real. */
export const SKELETON_VARIANTS = ['text', 'title', 'card', 'list', 'video', 'index'] as const;

export type SkeletonVariant = (typeof SKELETON_VARIANTS)[number];
