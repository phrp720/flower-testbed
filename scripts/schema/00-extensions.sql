-- Runs before schema.sql: docker-entrypoint-initdb.d executes files in lexical order,
-- and agent_embeddings.embedding is declared vector(1536), which needs this extension.
CREATE EXTENSION IF NOT EXISTS vector;
