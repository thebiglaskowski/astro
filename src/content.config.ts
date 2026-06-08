import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) => z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: image().optional(),
		tags: z.array(z.string()).optional(),
		draft: z.boolean().default(false),
		// Noir editorial fields (optional — enrich posts for homepage lead display)
		tag: z.string().optional(),
		read: z.string().optional(),
		excerpt: z.string().optional(),
		pullquote: z.string().optional(),
	}),
});

export const collections = { blog };
