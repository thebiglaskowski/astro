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

const WORDS_PER_MINUTE = 200;

export function readingTimeMinutes(body: string | undefined): number {
	if (!body) return 1;
	const text = body
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^import[^\n]*$/gm, ' ')
		.replace(/[#>*_~`|]/g, ' ');
	const words = text.split(/\s+/).filter(Boolean).length;
	return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function getRelatedPosts(
	post: CollectionEntry<'blog'>,
	all: CollectionEntry<'blog'>[],
	limit = 3,
): CollectionEntry<'blog'>[] {
	const postTags = new Set((post.data.tags ?? []).map(slugifyTag));
	if (postTags.size === 0) return [];

	return all
		.filter((p) => p.id !== post.id)
		.map((p) => {
			const overlap = (p.data.tags ?? []).reduce(
				(n, t) => (postTags.has(slugifyTag(t)) ? n + 1 : n),
				0,
			);
			return { post: p, overlap };
		})
		.filter((x) => x.overlap > 0)
		.sort((a, b) =>
			b.overlap - a.overlap ||
			b.post.data.pubDate.valueOf() - a.post.data.pubDate.valueOf(),
		)
		.slice(0, limit)
		.map((x) => x.post);
}
