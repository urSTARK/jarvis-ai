import { GoogleGenAI, GenerateContentResponse, Type, Modality } from "@google/genai";

// Helper to convert file to base64
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

export class GeminiService {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.apiKey = apiKey;
  }
  
  // Text generation for chat
  async generateText(prompt: string, useThinkingMode: boolean = false): Promise<GenerateContentResponse> {
    const model = useThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    const config = useThinkingMode ? { thinkingConfig: { thinkingBudget: 32768 } } : { thinkingConfig: { thinkingBudget: 0 } };
    
    return this.ai.models.generateContent({
        model,
        contents: prompt,
        config,
    });
  }

  // Streaming text generation for chat
  async generateTextStream(prompt: string, useThinkingMode: boolean = false): Promise<AsyncGenerator<GenerateContentResponse>> {
    const model = useThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    const config = useThinkingMode ? { thinkingConfig: { thinkingBudget: 32768 } } : { thinkingConfig: { thinkingBudget: 0 } };
    
    return this.ai.models.generateContentStream({
        model,
        contents: prompt,
        config,
    });
  }

  // Search Grounding
  async groundedSearch(query: string): Promise<GenerateContentResponse> {
    return this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: query,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });
  }

  // Maps Grounding
  async mapsSearch(query: string): Promise<GenerateContentResponse> {
    const location = await new Promise<{ latitude: number, longitude: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            (error) => reject(new Error(`Geolocation failed: ${error.message}. Please ensure location permissions are granted.`))
        );
    });
    
    return this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: query,
        config: {
            tools: [{ googleMaps: {} }],
            toolConfig: {
                retrievalConfig: { latLng: location }
            }
        },
    });
  }

  // Image Generation
  async generateImage(prompt: string): Promise<string> {
    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
        }
    }
    throw new Error("No image generated.");
  }

  // Image Editing
  async editImage(imageFile: File, prompt: string): Promise<string> {
    const imagePart = await fileToGenerativePart(imageFile);
    
    const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
        }
    }
    throw new Error("No image generated.");
  }

  // Image Understanding
  async analyzeImage(imageFile: File, prompt: string): Promise<string> {
      const imagePart = await fileToGenerativePart(imageFile);
      const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [imagePart, { text: prompt }] },
      });
      return response.text;
  }
  
  // Video Generation (text-to-video)
  async generateVideo(prompt: string, aspectRatio: '16:9' | '9:16'): Promise<string> {
      let operation = await this.ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
      });

      while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          operation = await this.ai.operations.getVideosOperation({ operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) throw new Error("Video generation failed.");
      
      const videoResponse = await fetch(`${downloadLink}&key=${this.apiKey}`);
      const blob = await videoResponse.blob();
      return URL.createObjectURL(blob);
  }

  // Video Generation (image-to-video)
  async generateVideoFromImage(imageFile: File, prompt: string, aspectRatio: '16:9' | '9:16'): Promise<string> {
      const { inlineData } = await fileToGenerativePart(imageFile);
      let operation = await this.ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt,
          image: { imageBytes: inlineData.data, mimeType: inlineData.mimeType },
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
      });
      
      while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 10000));
          operation = await this.ai.operations.getVideosOperation({ operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) throw new Error("Video generation failed.");

      const videoResponse = await fetch(`${downloadLink}&key=${this.apiKey}`);
      const blob = await videoResponse.blob();
      return URL.createObjectURL(blob);
  }

  // TTS
  async textToSpeech(text: string): Promise<ArrayBuffer> {
      const response = await this.ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: `Say with a standard, clear voice: ${text}` }] }],
          config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("TTS failed to generate audio.");
      
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
  }

  // Video understanding placeholder
  async analyzeVideo(videoFile: File, prompt: string): Promise<string> {
    console.log("Analyzing video:", videoFile.name, "with prompt:", prompt);
    // The current @google/genai SDK does not have a direct method for video file analysis in generateContent.
    // A real implementation would involve extracting frames and sending them as a sequence of images.
    return Promise.resolve("Video analysis is a complex feature that requires frame extraction, which is beyond the scope of this demonstration. In a full implementation, I would analyze frames from the video to answer your question.");
  }
}