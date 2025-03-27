const express = require('express');
const cors = require('cors');
const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
const ModelClient = require('@azure-rest/ai-inference').default;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
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

// Format the context data into a prompt for the AI
function formatContextForAI(query) {
  // Get relevant context based on the query
  const relevantContext = getRelevantContext(query);
  
  let contextText = 'Here is information about customer visits:\n\n';
  
  relevantContext.forEach((item, index) => {
    contextText += `Visit #${index + 1}:\n`;
    contextText += `Date: ${item.visit_date}\n`;
    contextText += `Sales Person: ${item.salesperson_name} (${item.salesperson_email}) from ${item.salesperson_region} region\n`;
    contextText += `Customer: ${item.customer_name} (SAP Code: ${item.customer_sap_code})\n`;
    contextText += `Product Division: ${item.product_division}\n`;
    contextText += `Next Steps: ${item.next_steps}\n`;
    contextText += `Outcome: ${item.outcome_of_the_meeting}\n\n`;
  });
  
  return contextText;
}

// Simple function to find relevant context based on query keywords
function getRelevantContext(query) {
  if (!contextData || contextData.length === 0) {
    return [];
  }
  
  // Convert query to lowercase for case-insensitive matching
  const queryLower = query.toLowerCase();
  
  // Look for keywords in the query
  return contextData.filter(item => {
    // Check various fields for matches
    const customerNameMatch = item.customer_name && item.customer_name.toLowerCase().includes(queryLower);
    const salesPersonMatch = item.salesperson_name && item.salesperson_name.toLowerCase().includes(queryLower);
    const regionMatch = item.salesperson_region && item.salesperson_region.toLowerCase().includes(queryLower);
    const productMatch = item.product_division && item.product_division.toLowerCase().includes(queryLower);
    const nextStepsMatch = item.next_steps && item.next_steps.toLowerCase().includes(queryLower);
    const outcomeMatch = item.outcome_of_the_meeting && item.outcome_of_the_meeting.toLowerCase().includes(queryLower);
    
    return customerNameMatch || salesPersonMatch || regionMatch || productMatch || nextStepsMatch || outcomeMatch;
  }).slice(0, 5); // Limit to 5 most relevant results
}

// API endpoint to chat with the AI
app.post('/api/chat', async (req, res) => {
  try {
    if (!client) {
      console.log('Client not initialized, attempting to initialize...');
      const initialized = initializeAzureOpenAI();
      if (!initialized) {
        return res.status(500).json({ error: 'Azure OpenAI client not initialized. Check server logs for details.' });
      }
    }

    const { message, conversation = [], model } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log(`Processing query: "${message}" using model: ${model || deploymentName}`);
    
    // Get context information relevant to the user's query
    const contextInfo = formatContextForAI(message);
    const relevantContextCount = getRelevantContext(message).length;
    console.log(`Found ${relevantContextCount} relevant context entries`);
    
    // Prepare conversation history for the AI
    const messages = [
      { role: "system", content: `You are JSW Steel Sales Insight Assistant, an advanced analytical tool for business analysts. Your knowledge base includes:

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


Instructions for Query Handling:
- Always cross-reference the 300-entry dataset with JSW's product/market data.
- Prioritize actionable insights.
- Use statistics, trends, and comparisons.
- Segment data by region, product, owner, or timeline.
- Flag risks/opportunities.
- Generate text-based chart descriptions with clear labels.
- Highlight payment delays and map logistics bottlenecks.

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
- Keep the design sleek and modern with minimal colors.
- For backgroundColor, use varying gray shades with 0.7 opacity.
- For borderColor, use black or dark gray with full opacity.
- Consider using "chartType": "bar", "line", "pie", or "doughnut" based on the data being presented.

Tone & Format:
- Conciseness: Use bullet points, headers, and bold keywords.
- Jargon: Avoid unless necessary.
- Data Citations: Reference entry numbers and JSW sources.` },
      { role: "user", content: `Here is the context information about customer visits:\n\n${contextInfo}\n\nUser question: ${message}` }
    ];
    
    // Add conversation history if available (limited to last 10 messages to manage context length)
    if (conversation && conversation.length > 0) {
      const recentConversation = conversation.slice(-10);
      messages.splice(1, 0, ...recentConversation);
    }

    // Use the model specified in the request or default to the one from .env
    const modelToUse = model || deploymentName;
    
    // Call Azure OpenAI API
    console.log(`Calling Azure OpenAI API (${modelToUse}) with ${messages.length} messages`);
    try {
      const result = await client.getChatCompletions(
        modelToUse, 
        messages,
        {
          temperature: 0.7,
          maxTokens: 4000,
          topP: 0.95
        }
      );
      
      if (!result || !result.choices || result.choices.length === 0) {
        console.error('No valid response received from Azure OpenAI');
        return res.status(500).json({ error: 'No response from AI' });
      }
      
      const reply = result.choices[0].message.content;
      console.log(`Received response of ${reply.length} characters`);
      
      // Extract chart data if present in the response
      let chartData = null;
      try {
        // Look for JSON block in markdown format
        const jsonMatch = reply.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          const parsedData = JSON.parse(jsonMatch[1]);
          if (parsedData.chartData) {
            chartData = parsedData.chartData;
            console.log('Found chart data in response');
          }
        }
      } catch (parseError) {
        console.error('Error parsing chart data from response:', parseError);
      }
      
      // Format the response to match the expected structure from server2.js
      res.json({ 
        response: {
          role: 'assistant',
          content: reply
        },
        chartData: chartData,
        usage: { 
          prompt_tokens: messages.reduce((acc, msg) => acc + msg.content.length, 0),
          completion_tokens: reply.length,
          total_tokens: messages.reduce((acc, msg) => acc + msg.content.length, 0) + reply.length
        }
      });
    } catch (apiError) {
      console.error('Azure OpenAI API Error:', apiError);
      return res.status(500).json({ 
        error: `Azure OpenAI API Error: ${apiError.message}`,
        details: apiError.toString()
      });
    }
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// API endpoint for streaming responses from the AI
app.post('/api/chat/stream', async (req, res) => {
  try {
    if (!client || !modelClient) {
      const initialized = initializeAzureOpenAI();
      if (!initialized) {
        return res.status(500).json({ error: 'Azure OpenAI client not initialized' });
      }
    }

    const { message, conversation = [], model } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get context information relevant to the user's query
    const contextInfo = formatContextForAI(message);
    
    // Get the same system prompt used in the regular endpoint
    const systemPrompt = `You are JSW Steel Sales Insight Assistant, an advanced analytical tool for business analysts. Your knowledge base includes:

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


Instructions for Query Handling:
- Always cross-reference the 300-entry dataset with JSW's product/market data.
- Prioritize actionable insights.
- Use statistics, trends, and comparisons.
- Segment data by region, product, owner, or timeline.
- Flag risks/opportunities.
- Generate text-based chart descriptions with clear labels.
- Highlight payment delays and map logistics bottlenecks.

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
- Keep the design sleek and modern with minimal colors.
- For backgroundColor, use varying gray shades with 0.7 opacity.
- For borderColor, use black or dark gray with full opacity.
- Consider using "chartType": "bar", "line", "pie", or "doughnut" based on the data being presented.

Tone & Format:
- Conciseness: Use bullet points, headers, and bold keywords.
- Jargon: Avoid unless necessary.
- Data Citations: Reference entry numbers and JSW sources.`;
    
    // Prepare conversation history for the AI
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Here is the context information about customer visits:\n\n${contextInfo}\n\nUser question: ${message}` }
    ];
    
    if (conversation && conversation.length > 0) {
      const recentConversation = conversation.slice(-10);
      messages.splice(1, 0, ...recentConversation);
    }

    // Use the model specified in the request or default to the one from .env
    const modelToUse = model || deploymentName;

    // Set up for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      console.log(`Making streaming request to ${modelToUse}...`);
      
      // Get the deployment-specific endpoint
      const deploymentEndpoint = `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${modelToUse}`;
      
      // Create a fresh instance of ModelClient for this request
      const client = new ModelClient(
        deploymentEndpoint, 
        new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
      );
      
      const streamResponse = await client.path("/chat/completions").post({
        body: {
          messages: messages,
          max_tokens: 4000,
          temperature: 0.7,
          top_p: 0.95,
          model: modelToUse,
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

// Test Azure OpenAI connection
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
    const result = await client.getChatCompletions(deploymentName, testMessages);
    
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Initialize OpenAI client
  initializeAzureOpenAI();
});

module.exports = app; 