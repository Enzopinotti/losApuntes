import { ApiAdmissionBudget } from './api-admission';

describe('ApiAdmissionBudget', () => {
  it('fails closed when the per-process in-flight budget is exhausted', () => {
    const budget = new ApiAdmissionBudget(2);

    expect(budget.tryAcquire('request-a')).toEqual({ admitted: true });
    expect(budget.tryAcquire('request-b')).toEqual({ admitted: true });
    expect(budget.tryAcquire('request-c')).toEqual({
      admitted: false,
      active: 2,
      maximum: 2,
    });

    budget.release('request-a');

    expect(budget.tryAcquire('request-c')).toEqual({ admitted: true });
    expect(budget.active()).toBe(2);
  });

  it('is idempotent for duplicate acquire/release bookkeeping', () => {
    const budget = new ApiAdmissionBudget(1);

    expect(budget.tryAcquire('same-request')).toEqual({ admitted: true });
    expect(budget.tryAcquire('same-request')).toEqual({ admitted: true });
    expect(budget.active()).toBe(1);

    budget.release('same-request');
    budget.release('same-request');

    expect(budget.active()).toBe(0);
  });

  it.each([0, -1, 10_001, 1.5, Number.NaN])(
    'rejects invalid maximum: %p',
    (maximum) => {
      expect(() => new ApiAdmissionBudget(maximum)).toThrow(
        'maximumInFlight must be an integer between 1 and 10000',
      );
    },
  );
});
