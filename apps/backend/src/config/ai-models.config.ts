/**
 * AI Model Configuration
 * Zentrale Konfiguration aller OpenAI-Modelle.
 * 
 * - fast: Für schnelle/günstige Tasks (Zusammenfassungen, Klassifikation, Entity-Extraktion)
 * - powerful: Für komplexe Tasks (Tool-Calling Agent, Antwort-Generierung)
 */
export const AI_MODELS = {
  /** gpt-5-mini – Zusammenfassungen, Klassifikation, Entity-Extraktion */
  fast: 'gpt-5-mini',
  /** gpt-5 – Tool-Calling Agent, Antwort-Generierung */
  powerful: 'gpt-5',
} as const;

export type AiModelTier = keyof typeof AI_MODELS;
