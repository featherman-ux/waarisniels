// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.date(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    image: z.object({
      url: z.string(),
      alt: z.string().optional(),
    }).optional(),
    photos: z.array(z.object({
      src: z.string(),
      alt: z.string().optional(),
    })).optional(),
  }),
});

export const collections = {
  blog: blogCollection,
};