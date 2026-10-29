import type { CollectionName, ContentCollections } from '@game/content';

export const SLUGS = [
  { slug: 'bestiariusz', collection: 'bestiary', label: 'Bestiariusz' },
  { slug: 'przedmioty', collection: 'items', label: 'Przedmioty' },
  { slug: 'zlecenia', collection: 'missions', label: 'Zlecenia' },
  { slug: 'lokacje', collection: 'locations', label: 'Lokacje' },
  { slug: 'teksty', collection: 'texts', label: 'Teksty' },
] as const;

export type CollectionSlug = (typeof SLUGS)[number]['slug'];

export function slugOf(collection: CollectionName): CollectionSlug | undefined {
  return SLUGS.find((item) => item.collection === collection)?.slug;
}

export function bySlug(slug: string): (typeof SLUGS)[number] | undefined {
  return SLUGS.find((item) => item.slug === slug);
}

export function recordLabel(record: { id: string; name?: string; title?: string }): string {
  return record.name ?? record.title ?? record.id;
}

export function recordsOf(
  collections: ContentCollections,
  collection: CollectionName,
): { id: string; name?: string; title?: string }[] {
  return collections[collection];
}
