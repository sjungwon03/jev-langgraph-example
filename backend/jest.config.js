module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.base.json',
      },
    ],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!.*(cockatiel|uuid|@nestjs/microservices|@nestjs/terminus|@modelcontextprotocol|@langchain))',
  ],
  collectCoverageFrom: [
    'apps/**/*.ts',
    'libs/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@nest-msa/common$': '<rootDir>/libs/common/src/index.ts',
    '^@nest-msa/common/(.*)$': '<rootDir>/libs/common/src/$1',
    '^@nest-msa/contracts$': '<rootDir>/libs/contracts/src/index.ts',
    '^@nest-msa/contracts/(.*)$': '<rootDir>/libs/contracts/src/$1',
    '^@nestjs/microservices$': '<rootDir>/tests/mocks/microservices.mock.js',
    '^@nestjs/terminus$': '<rootDir>/tests/mocks/terminus.mock.js',
    '^@nestjs/typeorm$': '<rootDir>/tests/mocks/typeorm.mock.js',
    '^uuid$': '<rootDir>/tests/mocks/uuid.mock.js',
  },
};
