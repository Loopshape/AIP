// Mock Ollama Service
// This service simulates responses from a local Ollama instance.
// It uses setTimeout to mimic network latency and asynchronous operations.

import type { UploadedFile } from '../types';

const MOCK_LATENCY = 1500;

// --- Text Generation ---
export const generateText = async (prompt: string, model: string, priority: 'Low' | 'Medium' | 'High' = 'Medium'): Promise<string> => {
  let latency = MOCK_LATENCY;
  if (priority === 'High') {
    latency = MOCK_LATENCY * 0.5;
  } else if (priority === 'Low') {
    latency = MOCK_LATENCY * 1.5;
  }
  
  console.log(`[OllamaService] Generating text with model ${model} for prompt: "${prompt}" (Priority: ${priority}, Latency: ${latency}ms)`);
  await new Promise(res => setTimeout(res, latency));

  if (prompt.toLowerCase().includes("please provide a detailed explanation")) {
    return `### Detailed Explanation

This is a simulated explanation from the Nexus agent. The provided content appears to be a JavaScript code snippet.

**Core Functionality:**

The code defines a function \`sortNumbers\` that takes an array (\`arr\`) as input. It uses the built-in JavaScript \`Array.prototype.sort()\` method to arrange the elements.

**Key Component: The Compare Function**

\`\`\`javascript
(a, b) => a - b
\`\`\`

This is the most critical part. The \`.sort()\` method, when used on numbers, can produce incorrect results if a compare function isn't provided (e.g., it would sort lexicographically, placing 10 before 2). This "compare function" tells \`.sort()\` how to order elements:
- If \`a - b\` is negative, \`a\` is sorted before \`b\`.
- If \`a - b\` is positive, \`b\` is sorted before \`a\`.
- If it's zero, the order is unchanged.

This logic correctly sorts numbers in ascending order.

**Execution Example:**

1.  A constant array \`numbers\` is declared: \`[5, 2, 8, 1, 9]\`.
2.  The \`sortNumbers\` function is called with this array.
3.  The result is stored in the \`sortedNumbers\` constant.
4.  \`console.log\` prints the final, sorted array to the console, which will be \`[1, 2, 5, 8, 9]\`.`;
  }

  if (prompt.toLowerCase().includes("sort an array")) {
    return `\`\`\`javascript
// Function to sort an array of numbers in ascending order
function sortNumbers(arr) {
  return arr.sort((a, b) => a - b);
}

const numbers = [5, 2, 8, 9];
const sortedNumbers = sortNumbers(numbers);
console.log(sortedNumbers); // Output: [1, 2, 5, 8, 9]
\`\`\``;
  }

  return `This is a simulated response for the prompt: "${prompt}". The selected model was **${model}**. This response demonstrates how the UI would display generative text output from a local agent.`;
};

// --- Vision/Text Generation ---
export const generateTextWithImage = async (prompt: string, image: UploadedFile, model: string): Promise<string> => {
  console.log(`[OllamaService] Generating text with model ${model} for prompt: "${prompt}" with image: ${image.file.name}`);
  await new Promise(res => setTimeout(res, MOCK_LATENCY + 500));

  return `Based on the analysis of the provided image and your prompt "${prompt}", here are the findings:

- **Primary Subject:** The image appears to be a landscape photo from a stock photography service.
- **Color Palette:** It features a prominent mix of blues, greens, and earthy tones, suggesting a natural outdoor scene.
- **Composition:** The composition follows the rule of thirds, creating a visually balanced and appealing image.
- **Potential Keywords:** landscape, nature, sky, travel, beautiful scenery.

This is a simulated analysis from the **Cognito** agent using the **${model}** model.`;
};


// --- Image Generation ---
export const generateImage = async (prompt: string, aspectRatio: string): Promise<string> => {
  console.log(`[OllamaService] Generating image for prompt: "${prompt}" with aspect ratio: ${aspectRatio}`);
  await new Promise(res => setTimeout(res, MOCK_LATENCY + 1000));
  const [width, height] = aspectRatio === '1:1' ? [512, 512] : aspectRatio === '16:9' ? [1024, 576] : [512, 512];
  
  // Using picsum.photos for placeholder images
  const response = await fetch(`https://picsum.photos/${width}/${height}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
  });
};

// --- Video Generation ---
export const generateVideo = async (prompt: string): Promise<{ videoUri: string }> => {
  console.log(`[OllamaService] Generating video for prompt: "${prompt}"`);
  // Simulate a longer generation time for video
  await new Promise(res => setTimeout(res, MOCK_LATENCY + 5000)); 
  // Placeholder video URL
  return { videoUri: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4' };
};

// --- Chat Simulation ---
class MockChat {
  async sendMessage(message: { message: string }): Promise<{ text: string }> {
    console.log(`[OllamaService] Chat message received: "${message.message}"`);
    await new Promise(res => setTimeout(res, MOCK_LATENCY / 2));
    return { text: `This is a mocked reply to your message: "${message.message}".` };
  }
}
export const startChat = (): MockChat => {
  return new MockChat();
};

// --- Live Voice Assistant Simulation ---
export type LiveSessionCallbacks = {
  onopen: () => void;
  onmessage: (message: any) => void;
  onerror: (error: any) => void;
  onclose: () => void;
};

class MockLiveSession {
  private callbacks: LiveSessionCallbacks;
  private intervals: number[] = [];
  private userSilenceTimeout: number | null = null;
  private isResponding = false;
  private mockUserWords = ["This", "is", "a", "mock", "transcription", "of", "your", "live", "voice", "input", ".", "The", "agent", "will", "respond", "when", "you", "pause", "."];
  private wordIndex = 0;

  // Audio processing members
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;


  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(stream: MediaStream) {
    console.log('[OllamaService] Live session connecting...');
    this.mediaStream = stream;
    setTimeout(() => {
      this.callbacks.onopen();
      this.setupAudioProcessing();
      console.log('[OllamaService] Live session opened.');
    }, 500);
  }

  private setupAudioProcessing() {
    if (!this.mediaStream) return;
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (_audioProcessingEvent) => {
      // This is called for every audio chunk from the microphone
      if (this.isResponding) return;
    
      // Simulate live transcription by sending a word for each audio chunk received
      if (this.wordIndex < this.mockUserWords.length) {
        const word = this.mockUserWords[this.wordIndex];
        this.callbacks.onmessage({ serverContent: { inputTranscription: { text: `${word} ` } } });
        this.wordIndex++;
      }

      // Detect user silence to trigger a response
      if (this.userSilenceTimeout) {
        clearTimeout(this.userSilenceTimeout);
      }
      this.userSilenceTimeout = setTimeout(() => {
        this.triggerModelResponse();
      }, 1500); // 1.5 seconds of silence
    };

    this.mediaStreamSource.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  private triggerModelResponse() {
    if (this.isResponding) return;
    this.isResponding = true;
    this.wordIndex = 0; // Reset mock transcription for the next user turn

    console.log('[OllamaService] User silence detected, triggering model response.');
    
    // Mark the end of the user's turn
    this.callbacks.onmessage({ serverContent: { turnComplete: true } });

    const modelWords = "I am the simulated agent, responding to your transcribed voice input.".split(" ");
    
    modelWords.forEach((word, index) => {
      this.intervals.push(setTimeout(() => {
         // Simulate empty audio data with transcription
        this.callbacks.onmessage({ serverContent: { modelTurn: { parts: [{ inlineData: { data: "" } }] }, outputTranscription: { text: `${word} ` } } });
      }, 100 + index * 200));
    });

    // After model is done, mark turn as complete and reset state
    this.intervals.push(setTimeout(() => {
      this.callbacks.onmessage({ serverContent: { turnComplete: true } });
      this.isResponding = false;
      console.log('[OllamaService] Model finished responding. Ready for user audio again.');
    }, 100 + modelWords.length * 200 + 250));
  }

  public close() {
    console.log('[OllamaService] Live session closed.');
    this.intervals.forEach(clearTimeout);
    if (this.userSilenceTimeout) {
      clearTimeout(this.userSilenceTimeout);
    }
    
    // Clean up audio resources
    if (this.mediaStreamSource && this.scriptProcessor && this.audioContext) {
        this.mediaStreamSource.disconnect();
        this.scriptProcessor.disconnect();
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
    }
    if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
    }

    this.callbacks.onclose();
  }
}

export const connectLive = (stream: MediaStream, callbacks: LiveSessionCallbacks): MockLiveSession => {
  const session = new MockLiveSession(callbacks);
  session.connect(stream);
  return session;
};