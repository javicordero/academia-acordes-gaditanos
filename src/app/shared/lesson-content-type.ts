export type LessonContentType = 'video' | 'pdf' | 'text';

export function isLessonContentType(value: string): value is LessonContentType {
  return value === 'video' || value === 'pdf' || value === 'text';
}
