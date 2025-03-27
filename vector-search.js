// Utility for vector search on embeddings
import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';
import { fileURLToPath } from 'url';

// Get current directory with ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let embeddingExtractor = null;
let embeddingsData = null;

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  return dotProduct / (normA * normB);
}

// Initialize the vector search system
async function initVectorSearch() {
  try {
    if (!embeddingsData) {
      // Load pre-computed embeddings
      const embeddingsFile = path.join(__dirname, 'embeddings.json');
      console.log('Loading embeddings from file...');
      embeddingsData = JSON.parse(fs.readFileSync(embeddingsFile, 'utf8'));
      console.log(`Loaded ${embeddingsData.length} embeddings`);
    }
    
    if (!embeddingExtractor) {
      // Initialize the embedding model
      console.log('Loading embedding model...');
      embeddingExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('Embedding model loaded successfully');
    }
    
    return true;
  } catch (error) {
    console.error('Error initializing vector search:', error);
    return false;
  }
}

// Search for relevant context based on a query
async function searchSimilarContext(query, topK = 5) {
  try {
    // Initialize if needed
    if (!embeddingsData || !embeddingExtractor) {
      const initialized = await initVectorSearch();
      if (!initialized) {
        return { success: false, error: 'Failed to initialize vector search' };
      }
    }
    
    // Generate embedding for the query
    console.log(`Generating embedding for query: "${query}"`);
    const result = await embeddingExtractor(query, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(result.data);
    
    // Find similar contexts based on cosine similarity
    const similarities = embeddingsData.map(item => ({
      ...item,
      similarity: cosineSimilarity(queryEmbedding, item.embedding)
    }));
    
    // Sort by similarity (descending) and take top K results
    const topResults = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    
    console.log(`Found ${topResults.length} relevant contexts for the query`);
    
    // Format the results to return
    return {
      success: true,
      results: topResults.map(item => ({
        text: item.text,
        metadata: item.metadata,
        similarity: item.similarity
      }))
    };
  } catch (error) {
    console.error('Error searching for similar context:', error);
    return { success: false, error: error.message };
  }
}

export { initVectorSearch, searchSimilarContext }; 