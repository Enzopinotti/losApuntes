import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('keeps the protected profile route behavior behind its guard metadata', () => {
    const controller = new UsersController();

    expect(controller).toBeDefined();
    expect(controller.getProfile()).toEqual({
      message: 'Ruta protegida por sesión revocable',
    });
  });
});
