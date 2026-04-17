import { getCollection, type CollectionEntry } from 'astro:content';

export function draftFilter({ data }: { data: { draft?: boolean } }) {
	return import.meta.env.PROD ? data.draft !== true : true;
}

export async function getPublishedPosts() {
	const posts = await getCollection('blog', draftFilter);
	return posts.sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
}

export function slugifyTag(tag: string): string {
	return tag
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export type TagSummary = { slug: string; name: string; count: number };

export async function getAllTags(): Promise<TagSummary[]> {
	const posts = await getPublishedPosts();
	const bySlug = new Map<string, { name: string; count: number }>();

	for (const post of posts) {
		for (const tag of post.data.tags ?? []) {
			const slug = slugifyTag(tag);
			if (!slug) continue;
			const existing = bySlug.get(slug);
			if (existing) {
				existing.count++;
			} else {
				bySlug.set(slug, { name: tag, count: 1 });
			}
		}
	}

	return Array.from(bySlug, ([slug, { name, count }]) => ({ slug, name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getPostsByTag(tagSlug: string): Promise<CollectionEntry<'blog'>[]> {
	const posts = await getPublishedPosts();
	return posts.filter((post) =>
		(post.data.tags ?? []).some((t) => slugifyTag(t) === tagSlug),
	);
}
