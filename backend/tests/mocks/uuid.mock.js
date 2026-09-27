module.exports = {
  v4: () => 'test-uuid-v4-mock',
  v6: () => require('node:crypto').randomUUID(),
  v5: () => require('node:crypto').randomUUID(),
  v7: () => require('node:crypto').randomUUID(),
};
