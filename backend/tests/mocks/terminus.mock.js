module.exports = {
  HealthCheck: () => () => {},
  HealthCheckService: class {
    check(indicators) {
      return Promise.resolve({ status: 'ok', info: {}, error: {}, details: {} });
    }
  },
  MemoryHealthIndicator: class {
    checkHeap() {
      return Promise.resolve({ memory_heap: { status: 'up' } });
    }
  },
  TypeOrmHealthIndicator: class {
    pingCheck() {
      return Promise.resolve({ database: { status: 'up' } });
    }
  },
  TerminusModule: class {},
};
