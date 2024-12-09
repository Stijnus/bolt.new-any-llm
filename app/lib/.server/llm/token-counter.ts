import { encode } from 'gpt-tokenizer';
import { addTokenUsage } from '~/lib/stores/tokenUsage';

export interface TokenCount {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function countTokens(text: string): number {
  return encode(text).length;
}

export function countMessageTokens(messages: { role: string; content: string }[]): TokenCount {
  let promptTokens = 0;
  let completionTokens = 0;

  messages.forEach((message) => {
    const tokens = countTokens(message.content);

    if (message.role === 'assistant') {
      completionTokens += tokens;
    } else {
      promptTokens += tokens;
    }
  });

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export function trackTokenUsage(messages: { role: string; content: string }[], model: string, provider: string): void {
  const tokenCount = countMessageTokens(messages);

  addTokenUsage({
    provider,
    model,
    promptTokens: tokenCount.promptTokens,
    completionTokens: tokenCount.completionTokens,
    totalTokens: tokenCount.totalTokens,
    timestamp: Date.now(),
  });
}
