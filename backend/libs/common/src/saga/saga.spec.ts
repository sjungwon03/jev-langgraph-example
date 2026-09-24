import { SagaOrchestrator } from './saga-orchestrator.service';

describe('SagaModule', () => {
  let orchestrator: SagaOrchestrator;

  beforeEach(() => {
    orchestrator = new SagaOrchestrator();
  });

  it('should successfully execute all sequential saga steps', async () => {
    const executed: string[] = [];

    const builder = orchestrator.createBuilder<{ orderId: string }>();
    const steps = builder
      .step('create_order')
      .execute(async (ctx) => {
        executed.push('create_order');
        ctx.orderId = 'ord-101';
      })
      .step('charge_payment')
      .execute(async () => {
        executed.push('charge_payment');
      })
      .step('dispatch_shipment')
      .execute(async () => {
        executed.push('dispatch_shipment');
      })
      .build();

    const result = await orchestrator.execute(steps, { orderId: '' });

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual([
      'create_order',
      'charge_payment',
      'dispatch_shipment',
    ]);
    expect(result.compensatedSteps).toEqual([]);
    expect(result.context.orderId).toBe('ord-101');
    expect(executed).toEqual(['create_order', 'charge_payment', 'dispatch_shipment']);
  });

  it('should compensate completed steps in reverse order (LIFO) upon failure', async () => {
    const compensated: string[] = [];

    const builder = orchestrator.createBuilder<{ accountBalance: number }>();
    const steps = builder
      .step('reserve_inventory')
      .execute(async () => {})
      .compensate(async () => {
        compensated.push('reserve_inventory');
      })
      .step('deduct_funds')
      .execute(async (ctx) => {
        ctx.accountBalance -= 100;
      })
      .compensate(async (ctx) => {
        ctx.accountBalance += 100;
        compensated.push('deduct_funds');
      })
      .step('confirm_order')
      .execute(async () => {
        throw new Error('Out of stock in fulfillment warehouse');
      })
      .compensate(async () => {
        compensated.push('confirm_order');
      })
      .build();

    const result = await orchestrator.execute(steps, { accountBalance: 500 });

    expect(result.success).toBe(false);
    expect(result.failedStep).toBe('confirm_order');
    expect(result.completedSteps).toEqual(['reserve_inventory', 'deduct_funds']);
    // Compensation must execute in reverse order: deduct_funds first, then reserve_inventory
    expect(compensated).toEqual(['deduct_funds', 'reserve_inventory']);
    expect(result.context.accountBalance).toBe(500); // 100 deducted then restored
  });
});
