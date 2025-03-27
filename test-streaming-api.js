import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
dotenv.config();

async function testStreamingEndpoint() {
  try {
    console.log('Testing streaming endpoint...');
    
    const response = await fetch('http://localhost:3001/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Say hello world',
        model: 'gpt-4o-mini'
      }),
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error:', errorData);
      return;
    }
    
    const contentType = response.headers.get('Content-Type');
    console.log(`Content-Type: ${contentType}`);
    
    if (contentType?.includes('text/event-stream')) {
      console.log('Received streaming response. Parsing...');
      
      // Handle the response as a stream
      let buffer = '';
      let fullContent = '';
      
      for await (const chunk of response.body) {
        // Convert the chunk to a string and add to buffer
        buffer += chunk.toString();
        
        // Process complete SSE messages
        let boundaryIndex;
        while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
          const line = buffer.substring(0, boundaryIndex);
          buffer = buffer.substring(boundaryIndex + 2);
          
          if (line.startsWith('data: ')) {
            const data = line.substring(5).trim();
            
            if (data === '[DONE]') {
              console.log('\nStream complete');
              console.log('Full content:');
              console.log(fullContent);
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                process.stdout.write(parsed.content); // Print without newline
              } else if (parsed.error) {
                console.error('\nError in stream:', parsed.error);
              }
            } catch (err) {
              console.warn('Error parsing SSE data:', err);
            }
          }
        }
      }
      
      console.log('\nStream ended');
    } else {
      // Handle as regular JSON
      const data = await response.json();
      console.log('Response data:', data);
    }
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testStreamingEndpoint(); 