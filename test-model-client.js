const ModelClient = require('@azure-rest/ai-inference').default;
const { AzureKeyCredential } = require('@azure/openai');
require('dotenv').config();

async function testModelClient() {
  try {
    console.log('Testing ModelClient for streaming...');
    
    const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini';
    
    if (!azureApiKey || !azureEndpoint) {
      console.error('Azure OpenAI API Key or Endpoint not configured');
      return;
    }
    
    console.log(`Endpoint: ${azureEndpoint}`);
    console.log(`Deployment: ${deploymentName}`);
    
    // Initialize the ModelClient
    const deploymentEndpoint = `${azureEndpoint}/openai/deployments/${deploymentName}`;
    console.log(`Deployment endpoint: ${deploymentEndpoint}`);
    
    const client = new ModelClient(
      deploymentEndpoint,
      new AzureKeyCredential(azureApiKey)
    );
    
    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hello world" }
    ];
    
    console.log('Making non-streaming request...');
    
    // Test regular request first
    const response = await client.path("/chat/completions").post({
      body: {
        messages: messages,
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.95,
        model: deploymentName
      }
    });
    
    if (response.status !== "200") {
      console.error('Error:', response.body?.error || 'Unknown error');
      return;
    }
    
    console.log('Response:');
    console.log(response.body.choices[0].message.content);
    
    // Now test streaming
    console.log('\nMaking streaming request...');
    
    const streamResponse = await client.path("/chat/completions").post({
      body: {
        messages: messages,
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.95,
        model: deploymentName,
        stream: true
      }
    });
    
    console.log(`Stream response status: ${streamResponse.status}`);
    
    if (streamResponse.status !== "200") {
      console.error('Streaming error:', streamResponse.body?.error || 'Unknown error');
      return;
    }
    
    // Process streaming response
    console.log('Streaming response:');
    let fullResponse = '';
    
    for await (const chunk of streamResponse.body) {
      const chunkText = chunk.toString();
      const lines = chunkText.split('\n');
      
      for (const line of lines) {
        if (line.trim() === '' || !line.startsWith('data:')) continue;
        
        const dataLine = line.replace(/^data: /, '').trim();
        if (dataLine === '[DONE]') {
          console.log('[DONE] marker received');
          continue;
        }
        
        try {
          const parsedData = JSON.parse(dataLine);
          
          if (parsedData.choices && parsedData.choices.length > 0) {
            const choice = parsedData.choices[0];
            if (choice.delta && choice.delta.content) {
              const content = choice.delta.content;
              fullResponse += content;
              process.stdout.write(content); // Print without newline
            }
          }
        } catch (err) {
          console.error('Error parsing streaming chunk:', err);
        }
      }
    }
    
    console.log('\n\nFull streaming response:');
    console.log(fullResponse);
    
    console.log('\nTest completed successfully');
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testModelClient(); 