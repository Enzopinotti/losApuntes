import 'reflect-metadata';

import { validateSync } from 'class-validator';

import { OrganizationSearchDto } from './organization.dto';

describe('OrganizationSearchDto verification filter', () => {
  it.each(['verified', 'unverified'])(
    'accepts the canonical %s state',
    (verificationState) => {
      const dto = Object.assign(new OrganizationSearchDto(), {
        verificationState,
      });

      expect(
        validateSync(dto).filter(
          (error) => error.property === 'verificationState',
        ),
      ).toEqual([]);
    },
  );

  it('rejects unknown verification states', () => {
    const dto = Object.assign(new OrganizationSearchDto(), {
      verificationState: 'pending',
    });

    expect(
      validateSync(dto).some((error) => error.property === 'verificationState'),
    ).toBe(true);
  });
});
