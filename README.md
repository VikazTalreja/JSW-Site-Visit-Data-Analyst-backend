# JSW Steel Sales Insight Assistant - Backend

This backend server connects to a locally hosted LLM on an Azure VM and serves as an API for the JSW Steel Sales Insight Assistant frontend.

## Features

- Connect to locally hosted LLMs on an Azure VM
- Support for multiple LLM API formats (OpenAI-compatible, Ollama, LM Studio)
- Context integration with JSW Steel sales data
- Chart data generation and parsing
- Markdown formatting for analytics responses

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-directory>/backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file based on the provided `.env.example`:

```bash
cp .env.example .env
```

Edit the `.env` file to match your Azure VM and LLM configuration:

```
LOCAL_LLM_API_URL=http://your-vm-ip:port/api-endpoint
LOCAL_LLM_API_KEY=your_api_key_if_needed
LLM_MODEL_NAME=your_model_name
LLM_API_FORMAT=openai  # Options: openai, ollama, lmstudio
PORT=3001
```

### 4. Start the Server

For development:

```bash
npm run dev
```

For production:

```bash
npm start
```

## Azure VM LLM Setup Options

### Option 1: OpenAI-compatible API (e.g., LM Studio, vLLM)

Most local LLM servers provide an OpenAI-compatible API. Set your environment variables:

```
LLM_API_FORMAT=openai
LOCAL_LLM_API_URL=http://your-vm-ip:8000/v1/chat/completions
```

### Option 2: Ollama

If you're using Ollama, set your environment variables:

```
LLM_API_FORMAT=ollama
LOCAL_LLM_API_URL=http://your-vm-ip:11434/api/generate
LLM_MODEL_NAME=llama3  # or your specific model name
```

### Option 3: LM Studio

If you're using LM Studio, set your environment variables:

```
LLM_API_FORMAT=lmstudio
LOCAL_LLM_API_URL=http://your-vm-ip:1234/v1/chat/completions
```

## API Endpoints

### POST /api/chat

Send chat messages and receive responses from the LLM.

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "Give me a summary of Q2 2024 sales performance across regions and product divisions, with YoY comparison trends."}
  ]
}
```

**Response:**
```json
{
  "response": {
    "role": "assistant",
    "content": "## Q2 2024 Sales Performance Summary\n\n1. Regional Performance (YoY Comparison)..."
  },
  "chartData": {
    "labels": ["West", "South", "North", "East"],
    "datasets": [...],
    "chartType": "bar"
  },
  "usage": {
    "prompt_tokens": 1024,
    "completion_tokens": 512,
    "total_tokens": 1536
  }
}
```

### GET /api/health

Check if the server is running.

**Response:**
```json
{
  "status": "ok",
  "message": "Server is running"
}
```

## Troubleshooting

1. **CORS Issues**: If you encounter CORS errors, ensure your frontend origin is allowed by the CORS configuration.

2. **Connection Failures**: Verify that your Azure VM's IP address is correct and the necessary ports are open in your network security group.

3. **API Format Issues**: Different LLM servers use different API formats. Set the `LLM_API_FORMAT` environment variable to match your LLM server.

4. **Model Not Found**: Ensure the model name specified in `LLM_MODEL_NAME` is available on your LLM server.

5. **Authentication Issues**: Some LLM servers require authentication. Set the `LOCAL_LLM_API_KEY` if needed.
