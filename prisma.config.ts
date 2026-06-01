import { defineConfig } from '@prisma/config'

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://agenthub:agenthub@localhost:5432/agenthub',
  },
  schema: 'packages/server/src/db/prisma/schema.prisma',
})
