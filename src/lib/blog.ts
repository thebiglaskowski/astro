import { getCollection } from 'astro:content';

export function draftFilter({ data }: { data: { draft?: boolean } }) {
	return import.meta.env.PROD ? data.draft !== true : true;
}

export async function getPublishedPosts() {
	const posts = await getCollection('blog', draftFilter);
	return posts.sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
}
