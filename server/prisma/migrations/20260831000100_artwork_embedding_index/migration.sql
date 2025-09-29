-- Approximate nearest-neighbour index for semantic search.
--
-- HNSW rather than IVFFlat: it needs no training pass over existing rows, so
-- it stays correct while the artwork cache is still filling up. Cosine ops
-- match the `<=>` operator used by the embedding repository.
CREATE INDEX IF NOT EXISTS "artworks_embedding_hnsw_idx"
  ON "artworks"
  USING hnsw ("embedding" vector_cosine_ops);
