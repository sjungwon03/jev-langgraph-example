let checkpointSequence = 0;

module.exports = {
  v4: () => require('node:crypto').randomUUID(),
  v6: () => `00000000-0000-6000-8000-${(++checkpointSequence).toString(16).padStart(12, '0')}`,
  v5: () => require('node:crypto').randomUUID(),
  v7: () => require('node:crypto').randomUUID(),
  validate: () => false,
};
