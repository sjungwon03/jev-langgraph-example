module.exports = {
  GrpcMethod: () => () => {},
  GrpcStreamMethod: () => () => {},
  MessagePattern: () => () => {},
  EventPattern: () => () => {},
  Payload: () => () => {},
  Ctx: () => () => {},
  Transport: { GRPC: 4, RMQ: 2, TCP: 0, REDIS: 1, MQTT: 3, KAFKA: 5 },
  ClientProxy: class {},
  ClientGrpc: class {},
  ClientsModule: {
    register: () => ({ module: class {}, providers: [] }),
    registerAsync: () => ({ module: class {}, providers: [] }),
  },
};
