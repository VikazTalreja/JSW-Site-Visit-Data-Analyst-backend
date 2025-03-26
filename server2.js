const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuration for local LLM on Azure VM
const LOCAL_LLM_API_URL = process.env.LOCAL_LLM_API_URL || 'http://localhost:8000/v1/chat/completions'; // Update with your VM IP and port
const LOCAL_LLM_API_KEY = process.env.LOCAL_LLM_API_KEY || ''; // May not be needed for local deployment

// Load context data
const contextData = JSON.parse(fs.readFileSync(path.join(__dirname, 'context.json'), 'utf8'));

// Define the system role prompt
const systemRolePrompt = `
You are JSW Steel Sales Insight Assistant, an advanced analytical tool for business analysts. Your knowledge base includes:

- 50 Sales Visit Entries (structured dataset with labeled fields: Owner Name, Visit Date, Customer Name, Region, Product Division, Next Steps).
- JSW Steel's Real Product & Market Data.

Analytical Capabilities:
- Trend analysis, regional performance, payment delays, customer segmentation, product division insights, and visualization of key metrics.

JSW Steel Product Data Integration:

Product Portfolio:
- Structural Steel: 35% of revenue; used in infrastructure projects.
- Automotive Steel: 25% revenue; supplies Tata Motors, Mahindra.
- Rebar & TMT: 20% revenue; dominant in East/South regions.
- Stainless Steel: 12% revenue; growing demand in industrial applications.
- Heavy Plates/Coils: 8% revenue; used in shipbuilding and energy sectors.

Market Position:
- India's 2nd-largest steel producer; 18% market share.
- Exports to 100+ countries (15% of total revenue).
- Avg. price/ton: ₹55,000 (Rebar), ₹72,000 (Automotive), ₹85,000 (Stainless).

Recent Updates:
- New PEB (Pre-Engineered Buildings) division launched in Q3 2023.
- Channel finance partnerships: ICICI, Axis, HDFC Bank.

Instructions for Query Handling:
- Always cross-reference the 50-entry dataset with JSW's product/market data.
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
- Use bold text (**text**) for important metrics and insights.
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
- Data Citations: Reference entry numbers and JSW sources.
`;

// Function to detect the API type and format the request accordingly
async function callLocalLLM(messages) {
  try {
    // Default to OpenAI-like API format (most common for local deployments)
    const apiFormat = process.env.LLM_API_FORMAT || 'openai';
    
    switch (apiFormat.toLowerCase()) {
      case 'ollama':
        // Format for Ollama API
        const userQuery = messages[messages.length - 1].content;
        const response = await axios.post(
          LOCAL_LLM_API_URL,
          {
            model: process.env.LLM_MODEL_NAME || "llama3",
            prompt: userQuery,
            system: systemRolePrompt,
            context: contextData,
            options: {
              temperature: 0.7,
              num_predict: 2000,
            }
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        return response.data.response;
        
      case 'lmstudio':
        // Format for LM Studio API
        const lmStudioResponse = await axios.post(
          LOCAL_LLM_API_URL,
          {
            model: process.env.LLM_MODEL_NAME || "local-model",
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        return lmStudioResponse.data.choices[0].message.content;
        
      case 'openai':
      default:
        // Format for OpenAI-compatible API
        const openaiResponse = await axios.post(
          LOCAL_LLM_API_URL,
          {
            model: process.env.LLM_MODEL_NAME || "gpt-3.5-turbo",
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000,
          },
          {
            headers: {
              'Authorization': LOCAL_LLM_API_KEY ? `Bearer ${LOCAL_LLM_API_KEY}` : '',
              'Content-Type': 'application/json',
            },
          }
        );
        return openaiResponse.data.choices[0].message.content;
    }
  } catch (error) {
    console.error('Error calling local LLM:', error.message);
    throw new Error('Failed to communicate with local LLM');
  }
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    // Add the system prompt as the first message if not already present
    const messageArray = [...messages];
    if (messageArray.length === 0 || messageArray[0].role !== 'system') {
      messageArray.unshift({
        role: 'system',
        content: systemRolePrompt
      });
    }
    
    // Call the local LLM using the detected format
    const responseText = await callLocalLLM(messageArray);
    
    let chartData = null;

    // Extract chart data if present
    if (responseText.includes('```json') && responseText.includes('chartData')) {
      try {
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[1]);
          chartData = parsedData.chartData;
        }
      } catch (e) {
        console.log('No valid chart data found in response:', e);
      }
    }

    // Create a clean text response without the JSON block
    let cleanResponseText = responseText;
    if (responseText.includes('```json')) {
      cleanResponseText = responseText.replace(/```json[\s\S]*?```/g, '');
    }

    // Return both chart data and text response
    res.json({ 
      response: {
        role: 'assistant',
        content: cleanResponseText || 'No content available'
      },
      chartData: chartData || generateDefaultChartData(messages[messages.length - 1].content),
      usage: { 
        prompt_tokens: messageArray.reduce((acc, msg) => acc + msg.content.length, 0),
        completion_tokens: responseText.length,
        total_tokens: messageArray.reduce((acc, msg) => acc + msg.content.length, 0) + responseText.length
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});

// Generate default chart data if none is provided by the model
function generateDefaultChartData(query) {
  // Modern color palette with black and gray shades
  const colors = {
    backgroundColor: [
      'rgba(45, 45, 45, 0.7)',
      'rgba(75, 75, 75, 0.7)',
      'rgba(105, 105, 105, 0.7)',
      'rgba(135, 135, 135, 0.7)',
      'rgba(165, 165, 165, 0.7)'
    ],
    borderColor: [
      'rgba(0, 0, 0, 1)',
      'rgba(30, 30, 30, 1)',
      'rgba(60, 60, 60, 1)',
      'rgba(90, 90, 90, 1)',
      'rgba(120, 120, 120, 1)'
    ]
  };

  // Default chart data based on query content
  if (query.toLowerCase().includes('sales performance') || query.toLowerCase().includes('performance trends')) {
    return {
      labels: ['Structural Steel', 'Automotive Steel', 'Rebar & TMT', 'Stainless Steel', 'Heavy Plates'],
      datasets: [
        {
          label: 'Revenue Share (%)',
          data: [35, 25, 20, 12, 8],
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          borderWidth: 1
        }
      ],
      chartType: 'bar'
    };
  } else if (query.toLowerCase().includes('payment') || query.toLowerCase().includes('overdue')) {
    return {
      labels: ['West', 'South', 'North', 'East'],
      datasets: [
        {
          label: 'Overdue Payments (%)',
          data: [15, 20, 25, 40],
          backgroundColor: colors.backgroundColor.slice(0, 4),
          borderColor: colors.borderColor.slice(0, 4),
          borderWidth: 1
        }
      ],
      chartType: 'bar'
    };
  } else {
    return {
      labels: ['West', 'South', 'North', 'East'],
      datasets: [
        {
          label: 'Data by Region',
          data: [42, 28, 20, 10],
          backgroundColor: colors.backgroundColor.slice(0, 4),
          borderColor: colors.borderColor.slice(0, 4),
          borderWidth: 1
        }
      ],
      chartType: 'bar'
    };
  }
}

// Chart data generation endpoint
app.post('/api/generate-chart', async (req, res) => {
  try {
    const { data, type } = req.body;
    const chartConfig = {
      type: type,
      data: data,
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: true,
            text: 'Generated Chart'
          }
        }
      }
    };
    
    res.json(chartConfig);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while generating the chart' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Create a .env file with your VM's LLM details
app.get('/api/create-env-example', (req, res) => {
  const envContent = `# Local LLM Configuration
LOCAL_LLM_API_URL=http://your-vm-ip:8000/v1/chat/completions
LOCAL_LLM_API_KEY=your_api_key_if_needed
LLM_MODEL_NAME=your_model_name
LLM_API_FORMAT=openai  # Options: openai, ollama, lmstudio
PORT=3001
`;

  fs.writeFileSync('.env.example', envContent);
  res.json({ success: true, message: 'Created .env.example file' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Local LLM API URL: ${LOCAL_LLM_API_URL}`);
  console.log(`API Format: ${process.env.LLM_API_FORMAT || 'openai'}`);
}); 