
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

// This function is designed to be run via `wrangler dev` or `wrangler pages dev`
// It needs access to the Cloudflare environment bindings (AI, VECTORIZE_INDEX)
export default {
  async fetch(request, env) {
    console.log("Starting embedding generation process...");

    const posts = await getBlogPosts();
    if (posts.length === 0) {
      console.log("No blog posts found. Exiting.");
      return new Response("No blog posts found to process.");
    }

    console.log(`Found ${posts.length} blog posts. Processing...`);

    const chunks = [];
    for (const post of posts) {
      const postChunks = chunkText(post.content, post.slug);
      chunks.push(...postChunks);
    }

    console.log(`Total chunks to process: ${chunks.length}`);

    // Process chunks in batches to avoid overwhelming the API
    const batchSize = 50;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1}...`);
      
      const embeddings = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: batch.map(chunk => chunk.text),
      });

      const vectors = embeddings.data.map((embedding, index) => ({
        id: `${batch[index].slug}-${i + index}`,
        values: embedding,
        metadata: { 
          slug: batch[index].slug,
          text: batch[index].text 
        },
      }));

      await env.VECTORIZE_INDEX.upsert(vectors);
      console.log(`Batch ${i / batchSize + 1} upserted successfully.`);
    }

    console.log("Embedding generation and upload complete!");
    return new Response("Embeddings generated and uploaded successfully!");
  }
};

async function getBlogPosts() {
  const postPaths = await glob('src/content/blog/**/*.md*');
  const posts = [];

  for (const postPath of postPaths) {
    const fileContent = await fs.readFile(postPath, 'utf-8');
    const { content } = matter(fileContent);
    const slug = path.basename(postPath, path.extname(postPath));
    
    // Simple text cleaning
    const cleanContent = content
      .replace(/---[\s\S]*?---/, '') // Remove frontmatter
      .replace(/<[^>]*>?/gm, '') // Remove HTML tags
      .replace(/[#*`_~]/g, '') // Remove markdown characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    if (cleanContent) {
      posts.push({ slug, content: cleanContent });
    }
  }
  return posts;
}

function chunkText(text, slug, chunkSize = 512, overlap = 50) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = i + chunkSize;
    chunks.push({
      slug,
      text: text.slice(i, end),
    });
    i += chunkSize - overlap;
  }
  return chunks;
}
