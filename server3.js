import express from 'express';
import cors from 'cors';
import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import ModelClient from '@azure-rest/ai-inference';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import * as vectorSearch from './vector-search.js';

// Configure environment variables
dotenv.config();

// Get current directory with ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Azure OpenAI Configuration
let client;
let modelClient;
let deploymentName;

// Load context data
let contextData = [];
try {
  contextData = JSON.parse(fs.readFileSync(path.join(__dirname, 'context.json'), 'utf8'));
  console.log(`Loaded ${contextData.length} context records from JSON file`);
} catch (error) {
  console.error('Error loading context data:', error);
}

// Initialize Azure OpenAI client
function initializeAzureOpenAI() {
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

  console.log('Initializing Azure OpenAI with:');
  console.log(`- Endpoint: ${azureEndpoint ? 'Configured' : 'Missing'}`);
  console.log(`- API Key: ${azureApiKey ? 'Configured' : 'Missing'}`);
  console.log(`- Deployment Name: ${deploymentName}`);
  console.log(`- API Version: ${apiVersion}`);

  if (!azureApiKey || !azureEndpoint) {
    console.error('Azure OpenAI API Key or Endpoint not configured');
    return false;
  }

  try {
    // Initialize the Azure OpenAI client
    client = new OpenAIClient(
      azureEndpoint,
      new AzureKeyCredential(azureApiKey),
      { apiVersion }
    );
    
    // Initialize the ModelClient for streaming
    const deploymentEndpoint = `${azureEndpoint}/openai/deployments/${deploymentName}`;
    modelClient = new ModelClient(
      deploymentEndpoint,
      new AzureKeyCredential(azureApiKey)
    );
    
    console.log('Azure OpenAI clients initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Azure OpenAI client:', error);
    return false;
  }
}

// Initialize RAG system
async function initializeRAG() {
  try {
    console.log('Initializing RAG system...');
    const initialized = await vectorSearch.initVectorSearch();
    if (initialized) {
      console.log('RAG system initialized successfully');
    } else {
      console.error('Failed to initialize RAG system');
    }
    return initialized;
  } catch (error) {
    console.error('Error initializing RAG system:', error);
    return false;
  }
}

// Format the relevant context data into a prompt for the AI
async function formatContextForAI(query) {
  try {
    // Get relevant context using vector search
    console.log('Retrieving relevant context for query...');
    const searchResult = await vectorSearch.searchSimilarContext(query, 10);
    
    if (!searchResult.success) {
      console.error('Error retrieving context:', searchResult.error);
      return { 
        contextText: 'No relevant context found.',
        contextCount: 0
      };
    }
    
    const relevantContext = searchResult.results;
    console.log(`Found ${relevantContext.length} relevant context entries`);
    
    // Format the relevant context
    let contextText = 'Here is the most relevant information about customer visits based on your query:\n\n';
    
    relevantContext.forEach((item, index) => {
      contextText += `Visit #${index + 1} (Similarity: ${item.similarity.toFixed(3)}):\n`;
      contextText += item.text + '\n\n';
    });
    
    return {
      contextText,
      contextCount: relevantContext.length
    };
  } catch (error) {
    console.error('Error formatting context for AI:', error);
    return {
      contextText: 'Error retrieving context data.',
      contextCount: 0
    };
  }
}

// API endpoint to chat with the AI
app.post('/api/chat', async (req, res) => {
  try {
    // Initialize Azure OpenAI if needed
    if (!client) {
      console.log('Client not initialized, attempting to initialize...');
      const initialized = initializeAzureOpenAI();
      if (!initialized) {
        return res.status(500).json({ error: 'Azure OpenAI client not initialized. Check server logs for details.' });
      }
    }
    
    // Initialize RAG system if not already initialized
    await initializeRAG();

    const { message, conversation = [], model } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log(`Processing query: "${message}" using model: ${deploymentName}`);
    
    // Get relevant context information using RAG
    const { contextText, contextCount } = await formatContextForAI(message);
    console.log(`Using ${contextCount} relevant context entries for this query`);
    
    // Prepare system message for the AI
    const systemContent = `You are JSW Steel Sales Insight Assistant, an advanced analytical tool for business analysts. Your knowledge base includes:

Analyze the provided sales visit reports to generate concise, insight-driven answers to the following business questions. Focus strictly on information explicitly mentioned in the data. Structure your response as a bulleted list under each question, including customer names, reasons, and direct excerpts from the reports as evidence.

- 300 Sales Visit Entries (structured dataset with labeled fields: Owner Name, Visit Date, Customer Name, Region, Product Division, Next Steps).
- JSW Steel's Real Product & Market Data.

Analytical Capabilities:
- Trend analysis, regional performance, payment delays, customer segmentation, product division insights, and visualization of key metrics.

1. Identify customers with expansion plans (new projects, capacity additions, or market penetration):
    * Look for mentions of new lines, upcoming projects, trials, or market expansion strategies.
2. Highlight dissatisfied customers and reasons for dissatisfaction:
    * Flag complaints about service delays, quality issues (e.g., rejections, defects), slow response times, or pricing concerns.
3. Pinpoint recurring quality issues and associated plants (if inferred):
    * Note rejections (e.g., paint peel-off), unresolved CAPAs, or tolerance disputes. Infer plants from context (e.g., Vasind, Vijayanagar).
4. Track major infrastructure projects and JSW's involvement:
	◦	Extract mentions of government projects (e.g., PM Awas Yojna), industrial projects (e.g., semiconductor plants), or large-volume orders tied to specific developments.

Below is the relevant context data based on the user's question. Use this to form your response:

${contextText}

Instructions for Query Handling:
- Always cross-reference the provided context entries with JSW's product/market data.
- Prioritize actionable insights based on the most relevant context entries.
- Use statistics, trends, and comparisons when possible.
- Segment data by region, product, owner, or timeline if relevant.
- Flag risks/opportunities.
- Generate text-based chart descriptions with clear labels.
- Highlight payment delays and map logistics bottlenecks if mentioned.

Markdown Formatting Instructions:
- For tables, use the following format:
  | Column 1 | Column 2 | Column 3 |
  |----------|----------|----------|
  | Data 1   | Data 2   | Data 3   |
- Always include header rows and separator rows in tables.
- Use consistent column widths.
- Align text appropriately (left for text, right for numbers).
- Keep tables simple and readable - no nested tables.
- Add a blank line before and after tables.
- Use ## for main headers and ### for subheaders.
- Use bold text (*text*) for important metrics and insights.
- Use bullet lists (- item) for grouped information.
- For numerical data, use consistent formatting (e.g., "₹42 Cr" for currency).
- if mentioning the Customer Name Mention Their Customer_sap_code Also MUST 
IMPORTANT: For EVERY response, you MUST include:
1. Text-based insights in Markdown format with bullet points, headers and key metrics
2. Chart data in JSON format within a code block like this:
\`\`\`json
{
  "chartData": {
    "labels": ["West", "South", "North", "East"],
    "datasets": [
      {
        "label": "Revenue by Region (₹ Cr)",
        "data": [42, 28, 20, 10],
        "backgroundColor": [
          "rgba(45, 45, 45, 0.7)",
          "rgba(75, 75, 75, 0.7)",
          "rgba(105, 105, 105, 0.7)",
          "rgba(135, 135, 135, 0.7)"
        ],
        "borderColor": [
          "rgba(0, 0, 0, 1)",
          "rgba(30, 30, 30, 1)",
          "rgba(60, 60, 60, 1)",
          "rgba(90, 90, 90, 1)"
        ],
        "borderWidth": 1
      }
    ],
    "chartType": "bar"
  }
}
\`\`\`

Example Queries & Responses:
- User Query: "Show Q1 2024 performance trends by product division."
- Response: Provide trend analysis, recommendations, and a chart visualization showing performance by division.

Chart Styling Guidelines:
- Use black and gray shades for all chart elements.
- Keep the design sleek and modern with minimal colors.`;
    
    // Prepare messages array for API call
    const messagesForAPI = [
      { role: "system", content: systemContent }
    ];
    
    // Add conversation history if provided
    if (Array.isArray(conversation) && conversation.length > 0) {
      conversation.forEach(msg => {
        if (msg && typeof msg === 'object' && msg.role && msg.content) {
          messagesForAPI.push(msg);
        }
      });
    }
    
    // Add the current message
    messagesForAPI.push({ role: "user", content: message });
    
    console.log(`Sending ${messagesForAPI.length} messages to Azure OpenAI API`);
    
    try {
      // Based on error trace, we need to fix how we call getChatCompletions
      const result = await client.getChatCompletions(
        deploymentName,
        messagesForAPI,
        {
          temperature: 0.7,
          maxTokens: 4000
        }
      );
      
      if (!result || !result.choices || result.choices.length === 0) {
        throw new Error('No response from Azure OpenAI API');
      }
      
      const reply = result.choices[0].message.content;
      console.log(`Received response of ${reply.length} characters`);
      console.log(reply);
      
      // Extract chart data if present in the response
      let chartData = null;
      let cleanedContent = reply;
      
      try {
        // Look for JSON block in markdown format
        const jsonMatch = reply.match(/```json\n([\s\S]*?)\n```/);
        console.log('Checking for chart data in response...');
        
        if (jsonMatch && jsonMatch[1]) {
          console.log('Found JSON block in markdown format');
          // Clean up the JSON string before parsing
          const jsonString = jsonMatch[1]
            .trim()
            .replace(/[\u2018\u2019]/g, "'")   // Replace smart quotes
            .replace(/[\u201C\u201D]/g, '"')   // Replace smart double quotes
            .replace(/(\w+):/g, '"$1":')       // Ensure property names are double-quoted
            .replace(/,\s*}/g, '}')            // Remove trailing commas
            .replace(/,\s*]/g, ']');           // Remove trailing commas in arrays
            
          console.log('Cleaned JSON string:', jsonString);
            
          try {
            const parsedData = JSON.parse(jsonString);
            if (parsedData.chartData) {
              chartData = parsedData.chartData;
              console.log('Successfully parsed chart data:', JSON.stringify(chartData, null, 2));
              
              // Remove the JSON block from the content since we're providing it separately
              cleanedContent = reply.replace(/```json\n[\s\S]*?\n```/, '');
              // Clean up any double line breaks that might have been created
              cleanedContent = cleanedContent.replace(/\n\n\n+/g, '\n\n');
              console.log('Removed JSON chart data from response content');
            } else {
              console.warn('Parsed JSON does not contain chartData property');
            }
          } catch (jsonError) {
            console.error('Error parsing cleaned JSON:', jsonError);
            console.error('Problematic JSON string:', jsonString);
          }
        } else {
          console.warn('No JSON chart data block found in the response');
        }
      } catch (parseError) {
        console.error('Error in chart data extraction:', parseError);
      }
      
      // Prepare the response object
      const responseObject = { 
        response: {
          role: 'assistant',
          content: cleanedContent,
        },
        chartData: chartData,
        usage: { 
          prompt_tokens: messagesForAPI.reduce((acc, msg) => acc + msg.content.length, 0),
          completion_tokens: reply.length,
          total_tokens: messagesForAPI.reduce((acc, msg) => acc + msg.content.length, 0) + reply.length
        }
      };

      // Log the complete response being sent to frontend
      console.log('Sending response to frontend:', JSON.stringify({
        contentLength: cleanedContent.length,
        hasChartData: !!chartData,
        chartType: chartData?.chartType,
        usage: responseObject.usage
      }, null, 2));

      res.json(responseObject);
    } catch (apiError) {
      console.error('Azure OpenAI API Error:', apiError);
      res.status(500).json({ error: 'Error calling Azure OpenAI API', details: apiError.message });
    }
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// API endpoint for streaming responses from the AI
app.post('/api/chat/stream', async (req, res) => {
  try {
    // Initialize Azure OpenAI if needed
    if (!client || !modelClient) {
      const initialized = initializeAzureOpenAI();
      if (!initialized) {
        return res.status(500).json({ error: 'Azure OpenAI client not initialized' });
      }
    }
    
    // Initialize RAG system if not already initialized
    await initializeRAG();

    const { message, conversation = [], model } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get relevant context information using RAG
    const { contextText, contextCount } = await formatContextForAI(message);
    console.log(`Streaming: Using ${contextCount} relevant context entries for this query`);
    
    // Prepare system message for the AI
    const systemContent = `You are JSW Steel Sales Insight Assistant, an advanced analytical tool for business analysts. Your knowledge base includes:

Analyze the provided sales visit reports to generate concise, insight-driven answers to the following business questions. Focus strictly on information explicitly mentioned in the data. Structure your response as a bulleted list under each question, including customer names, reasons, and direct excerpts from the reports as evidence.

- 300 Sales Visit Entries (structured dataset with labeled fields: Owner Name, Visit Date, Customer Name, Region, Product Division, Next Steps).
- JSW Steel's Real Product & Market Data.

Analytical Capabilities:
- Trend analysis, regional performance, payment delays, customer segmentation, product division insights, and visualization of key metrics.

1. Identify customers with expansion plans (new projects, capacity additions, or market penetration):
    * Look for mentions of new lines, upcoming projects, trials, or market expansion strategies.
2. Highlight dissatisfied customers and reasons for dissatisfaction:
    * Flag complaints about service delays, quality issues (e.g., rejections, defects), slow response times, or pricing concerns.
3. Pinpoint recurring quality issues and associated plants (if inferred):
    * Note rejections (e.g., paint peel-off), unresolved CAPAs, or tolerance disputes. Infer plants from context (e.g., Vasind, Vijayanagar).
4. Track major infrastructure projects and JSW's involvement:
	◦	Extract mentions of government projects (e.g., PM Awas Yojna), industrial projects (e.g., semiconductor plants), or large-volume orders tied to specific developments.

Below is the relevant context data based on the user's question. Use this to form your response:

${contextText}

Instructions for Query Handling:
- Always cross-reference the provided context entries with JSW's product/market data.
- Prioritize actionable insights based on the most relevant context entries.
- Use statistics, trends, and comparisons when possible.
- Segment data by region, product, owner, or timeline if relevant.
- Flag risks/opportunities.
- Generate text-based chart descriptions with clear labels.
- Highlight payment delays and map logistics bottlenecks if mentioned.

Markdown Formatting Instructions:
- For tables, use the following format:
  | Column 1 | Column 2 | Column 3 |
  |----------|----------|----------|
  | Data 1   | Data 2   | Data 3   |
- Always include header rows and separator rows in tables.
- Use consistent column widths.
- Align text appropriately (left for text, right for numbers).
- Keep tables simple and readable - no nested tables.
- Add a blank line before and after tables.
- Use ## for main headers and ### for subheaders.
- Use bold text (*text*) for important metrics and insights.
- Use bullet lists (- item) for grouped information.
- For numerical data, use consistent formatting (e.g., "₹42 Cr" for currency).

IMPORTANT: For EVERY response, you MUST include:
1. Text-based insights in Markdown format with bullet points, headers and key metrics
2. Chart data in JSON format within a code block like this:
\`\`\`json
{
  "chartData": {
    "labels": ["West", "South", "North", "East"],
    "datasets": [
      {
        "label": "Revenue by Region (₹ Cr)",
        "data": [42, 28, 20, 10],
        "backgroundColor": [
          "rgba(45, 45, 45, 0.7)",
          "rgba(75, 75, 75, 0.7)",
          "rgba(105, 105, 105, 0.7)",
          "rgba(135, 135, 135, 0.7)"
        ],
        "borderColor": [
          "rgba(0, 0, 0, 1)",
          "rgba(30, 30, 30, 1)",
          "rgba(60, 60, 60, 1)",
          "rgba(90, 90, 90, 1)"
        ],
        "borderWidth": 1
      }
    ],
    "chartType": "bar"
  }
}
\`\`\`

Example Queries & Responses:
- User Query: "Show Q1 2024 performance trends by product division."
- Response: Provide trend analysis, recommendations, and a chart visualization showing performance by division.

Chart Styling Guidelines:
- Use black and gray shades for all chart elements.
- Keep the design sleek and modern with minimal colors.`;
    
    // Prepare messages array for API call
    const messagesForAPI = [
      { role: "system", content: systemContent }
    ];
    
    // Add conversation history if provided
    if (Array.isArray(conversation) && conversation.length > 0) {
      conversation.forEach(msg => {
        if (msg && typeof msg === 'object' && msg.role && msg.content) {
          messagesForAPI.push(msg);
        }
      });
    }
    
    // Add the current message
    messagesForAPI.push({ role: "user", content: message });

    // Use the model specified in the request or default to the one from .env
    const modelToUse = model || deploymentName;

    // Set up for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      console.log(`Making streaming request to ${modelToUse} with ${messagesForAPI.length} messages...`);
      
      // Get the deployment-specific endpoint
      const deploymentEndpoint = `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${modelToUse}`;
      
      // Create a fresh instance of ModelClient for this request
      const streamClient = new ModelClient(
        deploymentEndpoint, 
        new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
      );
      
      // For the POST body of streaming calls, we set the messages directly
      const streamResponse = await streamClient.path("/chat/completions").post({
        body: {
          messages: messagesForAPI,
          max_tokens: 4000,
          temperature: 0.7,
          top_p: 0.95,
          stream: true
        }
      });
      
      console.log(`Stream response status: ${streamResponse.status}`);
      
      if (streamResponse.status !== "200") {
        console.error('Error from Azure OpenAI:', streamResponse.body?.error || 'Unknown error');
        res.write(`data: ${JSON.stringify({ error: 'Error processing request' })}\n\n`);
        res.end();
        return;
      }
      
      // Process the stream response
      for await (const chunk of streamResponse.body) {
        // Convert chunk to string
        const chunkText = chunk.toString();
        
        // Split by lines and process each line
        const lines = chunkText.split('\n');
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          // Remove 'data: ' prefix if it exists and handle [DONE]
          if (line.startsWith('data:')) {
            const dataLine = line.substring(5).trim();
            
            if (dataLine === '[DONE]') {
              res.write('data: [DONE]\n\n');
              continue;
            }
            
            try {
              const parsedData = JSON.parse(dataLine);
              
              if (parsedData.choices && parsedData.choices.length > 0) {
                const choice = parsedData.choices[0];
                if (choice.delta && choice.delta.content) {
                  res.write(`data: ${JSON.stringify({ content: choice.delta.content })}\n\n`);
                }
              }
            } catch (err) {
              console.error('Error parsing streaming data:', err);
            }
          } else {
            // If the line doesn't start with 'data:', try to parse it directly
            try {
              const parsedData = JSON.parse(line);
              
              if (parsedData.choices && parsedData.choices.length > 0) {
                const choice = parsedData.choices[0];
                if (choice.delta && choice.delta.content) {
                  res.write(`data: ${JSON.stringify({ content: choice.delta.content })}\n\n`);
                }
              }
            } catch (err) {
              // Skip lines that aren't valid JSON
            }
          }
        }
      }
      
      // End the response
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (apiError) {
      console.error('Azure OpenAI Streaming API Error:', apiError);
      res.write(`data: ${JSON.stringify({ error: apiError.message || 'Error processing request' })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error in streaming chat endpoint:', error);
    res.write(`data: ${JSON.stringify({ error: error.message || 'Internal server error' })}\n\n`);
    res.end();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', contextRecords: contextData.length });
});

// Fix the test-azure endpoint
app.get('/test-azure', async (req, res) => {
  try {
    if (!client) {
      const initialized = initializeAzureOpenAI();
      if (!initialized) {
        return res.status(500).json({ 
          status: 'error', 
          message: 'Azure OpenAI client not initialized',
          env: {
            endpoint: process.env.AZURE_OPENAI_ENDPOINT ? 'configured' : 'missing',
            apiKey: process.env.AZURE_OPENAI_API_KEY ? 'configured' : 'missing',
            deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'using default',
            apiVersion: process.env.AZURE_OPENAI_API_VERSION || 'using default'
          }
        });
      }
    }
    
    // Simple test message
    const testMessages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hello world" }
    ];
    
    console.log(`Testing connection to Azure OpenAI (${deploymentName})...`);
    
    const result = await client.getChatCompletions(
      deploymentName,
      testMessages,
      {
        temperature: 0.7,
        maxTokens: 100
      }
    );
    
    if (!result || !result.choices || result.choices.length === 0) {
      return res.status(500).json({ 
        status: 'error', 
        message: 'No response from Azure OpenAI API'
      });
    }
    
    res.json({
      status: 'ok',
      message: 'Azure OpenAI connection successful',
      response: result.choices[0].message.content,
      deploymentName: deploymentName,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview'
    });
  } catch (error) {
    console.error('Error testing Azure OpenAI:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Error testing Azure OpenAI connection',
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Initialize the server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize the OpenAI client
  const initialized = initializeAzureOpenAI();
  if (initialized) {
    console.log('Azure OpenAI client initialized successfully');
  } else {
    console.error('Failed to initialize Azure OpenAI client');
  }
  
  // Initialize the RAG system
  const ragInitialized = await initializeRAG();
  if (ragInitialized) {
    console.log('RAG system ready for queries');
  } else {
    console.error('Failed to initialize RAG system');
  }
}); 