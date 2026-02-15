/**
 * AI Model Configuration
 * Zentrale Konfiguration aller OpenAI-Modelle.
 * 
 * - fast: Für schnelle/günstige Tasks (Zusammenfassungen, Klassifikation, Entity-Extraktion)
 * - powerful: Für komplexe Tasks (Tool-Calling Agent, Antwort-Generierung)
 *
 * GPT-5.2: Flagship model for coding & agentic tasks.
 *   400k context, 128k output, reasoning support (effort: none|low|medium|high|xhigh)
 *   Pricing: $1.75/1M input, $14/1M output
 */
export const AI_MODELS = {
    fast: 'gpt-5-mini',
    powerful: 'gpt-5.2',
} as const ;

export type AiModelTier = keyof typeof AI_MODELS;
