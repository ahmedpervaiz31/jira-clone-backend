export default {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^\\.\\./\\.\\./jira-rag/(.*)$': '<rootDir>/tests/__mocks__/jira-rag.mock.js'
  }
};