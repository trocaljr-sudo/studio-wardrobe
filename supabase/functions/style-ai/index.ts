const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function extractOutputText(response: any) {
  const outputs = Array.isArray(response?.output) ? response.output : [];

  for (const output of outputs) {
    if (output?.type !== 'message' || !Array.isArray(output?.content)) {
      continue;
    }

    for (const content of output.content) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        return content.text;
      }
    }
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini';

  if (!openAiApiKey) {
    return jsonResponse({ error: 'Missing OPENAI_API_KEY secret.' }, 500);
  }

  try {
    const payload = await request.json();
    const { context, instructions, request: styleRequest } = payload ?? {};

    if (!context || !instructions || !styleRequest?.focus) {
      return jsonResponse({ error: 'Missing styling payload.' }, 400);
    }

    const schema = {
      name: 'studio_wardrobe_style_response',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          focus: {
            type: 'string',
            enum: ['outfit-suggestions', 'gap-analysis'],
          },
          promptSummary: { type: 'string' },
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                itemIds: { type: 'array', items: { type: 'string' } },
                itemNames: { type: 'array', items: { type: 'string' } },
                rationale: { type: 'string' },
                confidenceScore: { type: 'number' },
                confidenceLabel: {
                  type: 'string',
                  enum: ['grounded', 'exploratory'],
                },
                sourceOutfitId: {
                  anyOf: [{ type: 'string' }, { type: 'null' }],
                },
              },
              required: [
                'label',
                'itemIds',
                'itemNames',
                'rationale',
                'confidenceScore',
                'confidenceLabel',
                'sourceOutfitId',
              ],
            },
          },
          gaps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                rationale: { type: 'string' },
              },
              required: ['label', 'rationale'],
            },
          },
        },
        required: ['focus', 'promptSummary', 'suggestions', 'gaps'],
      },
    };

    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: instructions }],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  focus: styleRequest.focus,
                  prompt: styleRequest.prompt,
                  count: styleRequest.count,
                  context,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            ...schema,
          },
        },
      }),
    });

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      return jsonResponse({ error: errorText }, 500);
    }

    const responseJson = await openAiResponse.json();
    const outputText = extractOutputText(responseJson);

    if (!outputText) {
      return jsonResponse({ error: 'No model output returned.' }, 500);
    }

    const parsed = JSON.parse(outputText);
    return jsonResponse({
      ...parsed,
      generatedWith: 'ai',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown AI function failure.';
    return jsonResponse({ error: message }, 500);
  }
});
