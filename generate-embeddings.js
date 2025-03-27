// Script to generate embeddings from context.json and save to embeddings.json
import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';
import { fileURLToPath } from 'url';

// Get current directory with ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load context.json
const contextFile = path.join(__dirname, 'context.json');
const outputFile = path.join(__dirname, 'embeddings.json');

// Function to combine relevant fields into a single text for embedding
function createEmbeddingText(item) {
  return `
    Customer: ${item.customer_name}
    Date: ${item.visit_date}
    Salesperson: ${item.salesperson_name} (${item.salesperson_region})
    Product: ${item.product_division}
    Outcome: ${item.outcome_of_the_meeting}
    Next Steps: ${item.next_steps}
  `.trim();
}

async function generateEmbeddings() {
  console.log('Loading context data...');
  const contextData = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
  console.log(`Loaded ${contextData.length} records from context.json`);

  // Initialize the embedding pipeline
  console.log('Loading embedding model...');
  const embeddingExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('Model loaded successfully');

  const embeddingsData = [];
  const batchSize = 10; // Process in small batches to avoid memory issues

  console.log(`Generating embeddings for ${contextData.length} records in batches of ${batchSize}...`);
  
  for (let i = 0; i < contextData.length; i += batchSize) {
    const batch = contextData.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contextData.length / batchSize)}`);
    
    const batchPromises = batch.map(async (item, index) => {
      try {
        const text = createEmbeddingText(item);
        const result = await embeddingExtractor(text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(result.data);
        
        return {
          id: i + index,
          text,
          metadata: {
            customer_name: item.customer_name,
            visit_date: item.visit_date,
            salesperson_name: item.salesperson_name,
            product_division: item.product_division,
            salesperson_region: item.salesperson_region
          },
          embedding
        };
      } catch (error) {
        console.error(`Error processing item ${i + index}:`, error);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    embeddingsData.push(...batchResults.filter(item => item !== null));
  }

  console.log(`Successfully generated ${embeddingsData.length} embeddings`);
  
  // Save embeddings to file
  fs.writeFileSync(outputFile, JSON.stringify(embeddingsData, null, 2));
  console.log(`Embeddings saved to ${outputFile}`);
}

generateEmbeddings().catch(error => {
  console.error('Error generating embeddings:', error);
  process.exit(1);
}); 