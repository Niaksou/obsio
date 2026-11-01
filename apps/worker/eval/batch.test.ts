import { describe, expect, it } from 'vitest';
import { parseBatchOutput } from './batch.js';

describe('résultats de l’API batch', () => {
  it('lit les réponses réussies et en échec, par identifiant', () => {
    const jsonl = [
      JSON.stringify({
        id: 'batch-1',
        custom_id: 'site-a/2025',
        response: {
          status_code: 200,
          body: {
            choices: [{ message: { role: 'assistant', content: '{"documents":[]}' } }],
            usage: { prompt_tokens: 1200, completion_tokens: 80 },
          },
        },
        error: null,
      }),
      JSON.stringify({
        id: 'batch-2',
        custom_id: 'site-b/2025',
        response: { status_code: 400, body: { message: 'Prompt trop long' } },
        error: null,
      }),
      '',
    ].join('\n');

    const outputs = parseBatchOutput(jsonl);
    expect(outputs.get('site-a/2025')).toEqual({
      content: '{"documents":[]}',
      promptTokens: 1200,
      completionTokens: 80,
    });
    const failed = outputs.get('site-b/2025');
    expect(failed?.content).toBeNull();
    expect(failed?.error).toContain('400');
    expect(failed?.error).toContain('Prompt trop long');
  });
});
