-- Enable pgvector for embedding columns (dimensions: 1536 by default in schema).
CREATE EXTENSION IF NOT EXISTS vector;
-- Useful auxiliary extensions.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
