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

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

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
- For tables, use proper Markdown table format with headers, column dividers, and row data.
- Ensure proper spacing between table rows.
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

async function getDeepSeekResponse(userMessage) {
  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: systemRolePrompt
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        top_p: 0.95,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        context: contextData // Assuming contextData is loaded from context.json
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw new Error('An error occurred while processing your request');
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
    
    const response = await axios.post(
      DEEPSEEK_API_URL,
      { 
        model: "deepseek-chat",
        messages: messageArray,
        temperature: 0.7,
        max_tokens: 2000,
        top_p: 0.95,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
        context: contextData
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const responseText = response.data.choices[0].message.content;
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
      usage: response.data.usage
    });
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 