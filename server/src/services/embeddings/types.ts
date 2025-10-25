/**
 * The embedding provider contract.
 *
 * Nothing outside this folder knows which provider is in use, what its API
 * looks like, or whether it needs a network call. Swapping OpenAI for another
 * vendor -- or for a local model -- means adding one file here.
 */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;

  createEmbedding(text: string): Promise<number[]>;

  /** Batched form. Providers that have no batch API may loop. */
  createEmbeddings(texts: string[]): Promise<number[][]>;
}
