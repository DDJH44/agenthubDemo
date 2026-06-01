module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/packages/frontend/src/$1',
    '^@agenthub/shared$': '<rootDir>/packages/shared/src/index.ts',
    '^@agenthub/adapter$': '<rootDir>/packages/adapter/src/index.ts',
  },
};