import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SagaStep, SagaResult } from './saga.interface';
import { SagaBuilder } from './saga-builder';

@Injectable()
export class SagaOrchestrator {
  private readonly logger = new Logger(SagaOrchestrator.name);

  /**
   * Creates a new SagaBuilder instance
   */
  createBuilder<TContext = any>(): SagaBuilder<TContext> {
    return new SagaBuilder<TContext>();
  }

  /**
   * Executes a sequence of saga steps with automatic rollback on failure
   */
  async execute<TContext>(
    steps: SagaStep<TContext>[],
    initialContext: TContext,
  ): Promise<SagaResult<TContext>> {
    const sagaId = uuidv4();
    const completedSteps: SagaStep<TContext>[] = [];
    const compensatedSteps: string[] = [];
    const context = { ...initialContext };

    this.logger.log(`🌀 [SAGA:${sagaId}] Starting saga execution with ${steps.length} steps`);

    for (const step of steps) {
      try {
        this.logger.log(`🌀 [SAGA:${sagaId}] Executing step: "${step.name}"`);
        await step.execute(context);
        completedSteps.push(step);
      } catch (err: any) {
        this.logger.error(
          `❌ [SAGA:${sagaId}] Step "${step.name}" failed: ${err.message}. Initiating compensating transactions...`,
        );

        // Execute compensations in reverse order (LIFO)
        for (let i = completedSteps.length - 1; i >= 0; i--) {
          const compStep = completedSteps[i];
          if (compStep.compensate) {
            try {
              this.logger.warn(`🔄 [SAGA:${sagaId}] Compensating step: "${compStep.name}"`);
              await compStep.compensate(context, err);
              compensatedSteps.push(compStep.name);
            } catch (compErr: any) {
              this.logger.error(
                `💥 [SAGA:${sagaId}] Critical compensation failure on step "${compStep.name}": ${compErr.message}`,
              );
            }
          }
        }

        return {
          sagaId,
          success: false,
          completedSteps: completedSteps.map((s) => s.name),
          failedStep: step.name,
          compensatedSteps,
          error: err,
          context,
        };
      }
    }

    this.logger.log(`✅ [SAGA:${sagaId}] Saga successfully completed all ${steps.length} steps`);

    return {
      sagaId,
      success: true,
      completedSteps: completedSteps.map((s) => s.name),
      compensatedSteps: [],
      context,
    };
  }
}
