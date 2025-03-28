import xlsx from 'xlsx';
import { pipeline } from '@xenova/transformers';
import { Document } from 'langchain/document';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the embedding class outside the export
class XenovaEmbeddings {
  constructor() {
    this.embedder = null;
  }

  async initialize() {
    this.embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true }
    );
  }

  async embedDocuments(texts) {
    if (!this.embedder) await this.initialize();
    const embeddings = [];
    for (const text of texts) {
      const output = await this.embedder(text, { pooling: 'mean', normalize: true });
      embeddings.push(Array.from(output.data));
    }
    return embeddings;
  }

  async embedQuery(text) {
    if (!this.embedder) await this.initialize();
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }
}

let vectorStore;

export async function initVectorSearch() {
  try {
    // Initialize Xenova embedder
    const embeddings = new XenovaEmbeddings();
    await embeddings.initialize();

    // Load Excel file
    const workbook = xlsx.readFile(path.join(__dirname, 'context.xlsx'));
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);

    // Process Excel data into documents (row-wise)
    const documents = jsonData.map((row, index) => {
      return new Document({
        pageContent: `Sales visit record ${index + 1}`,
        metadata: { 
          rowId: index + 1,
          ...row
        }
      });
    });

    // Create vector store
    vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);

    console.log(`Vector search initialized with ${documents.length} records`);
    return true;
  } catch (error) {
    console.error('Error initializing vector search:', error);
    return false;
  }
}

export async function searchSimilarContext(query, k = 5) {
  try {
    if (!vectorStore) {
      await initVectorSearch();
    }

    // Exact email count query
    if (query.includes('@jsw.in') && query.toLowerCase().includes('how many times')) {
      const emailMatch = query.match(/[a-zA-Z0-9._-]+@jsw\.in/);
      if (!emailMatch) return { success: false, error: 'Invalid email format' };
      
      const email = emailMatch[0].toLowerCase();
      const results = await vectorStore.similaritySearch(query, 1000);
      
      const count = results.filter(doc => 
        Object.values(doc.metadata).some(val => 
          String(val).toLowerCase() === email
        )
      ).length;

      return {
        success: true,
        results: [{
          text: `${email} appears ${count} times`,
          metadata: { email, count },
          similarity: 1.0
        }]
      };
    }

    // Normal semantic search
    const results = await vectorStore.similaritySearch(query, k);
    return {
      success: true,
      results: results.map(doc => ({
        text: formatRowData(doc.metadata),
        metadata: doc.metadata,
        similarity: 1.0
      }))
    };
  } catch (error) {
    console.error('Error searching context:', error);
    return { success: false, error: error.message };
  }
}

function formatRowData(row) {
  return Object.entries(row)
    .filter(([key]) => key !== 'rowId')
    .map(([key, value]) => `• ${key}: ${value}`)
    .join('\n');
}