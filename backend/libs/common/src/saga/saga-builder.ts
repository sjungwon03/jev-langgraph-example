import { SagaStep } from './saga.interface';

export class SagaStepBuilder<TContext> {
  private stepDef: Partial<SagaStep<TContext>> = {};

  constructor(private readonly builder: SagaBuilder<TContext>, name: string) {
    this.stepDef.name = name;
  }

  execute(fn: (context: TContext) => Promise<any>): this {
    this.stepDef.execute = fn;
    return this;
  }

  compensate(fn: (context: TContext, error?: Error) => Promise<void>): this {
    this.stepDef.compensate = fn;
    return this;
  }

  step(name: string): SagaStepBuilder<TContext> {
    this.commitStep();
    return this.builder.step(name);
  }

  build(): SagaStep<TContext>[] {
    this.commitStep();
    return this.builder.getSteps();
  }

  private commitStep(): void {
    if (this.stepDef.name && this.stepDef.execute) {
      this.builder.addStep(this.stepDef as SagaStep<TContext>);
      this.stepDef = {};
    }
  }
}

export class SagaBuilder<TContext = any> {
  private readonly steps: SagaStep<TContext>[] = [];

  step(name: string): SagaStepBuilder<TContext> {
    return new SagaStepBuilder<TContext>(this, name);
  }

  addStep(step: SagaStep<TContext>): void {
    this.steps.push(step);
  }

  getSteps(): SagaStep<TContext>[] {
    return [...this.steps];
  }
}
