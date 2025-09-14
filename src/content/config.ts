import { defineCollection, z } from 'astro:content';

const dateStringToDate = z.preprocess((val) => {
  // val is the raw frontmatter value (string)
  if (typeof val === 'string' && !isNaN(Date.parse(val))) {
    return new Date(val);
  }
  return val;
}, z.date());

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: dateStringToDate,
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    image: z
      .object({ url: z.string(), alt: z.string().optional() })
      .optional(),
    photos: z
      .array(z.object({ src: z.string(), alt: z.string().optional() }))
      .optional(),
  }),
});

export const collections = {
  blog: blogCollection,
};
