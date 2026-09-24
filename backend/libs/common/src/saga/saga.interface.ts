export interface SagaStep<TContext = any> {
  name: string;
  execute: (context: TContext) => Promise<any>;
  compensate?: (context: TContext, error?: Error) => Promise<void>;
}

export interface SagaResult<TContext = any> {
  sagaId: string;
  success: boolean;
  completedSteps: string[];
  failedStep?: string;
  compensatedSteps: string[];
  error?: Error;
  context: TContext;
}
