declare module "@google/generative-ai" {
  export interface GenerateContentResponse {
    response?: {
      text(): string;
    };
  }

  export interface GenerateContentRequest {
    contents: Array<{
      role: string;
      parts: Array<{ text: string }>;
    }>;
    generationConfig?: {
      temperature?: number;
      responseMimeType?: string;
    };
  }

  export interface GenerativeModel {
    generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>;
  }

  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(options: {
      model: string;
      systemInstruction?: string;
    }): GenerativeModel;
  }
}

