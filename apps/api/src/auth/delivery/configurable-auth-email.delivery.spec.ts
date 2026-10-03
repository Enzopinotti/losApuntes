import type { ConfigService } from '@nestjs/config';

import { ConfigurableAuthEmailDelivery } from './configurable-auth-email.delivery';

describe('ConfigurableAuthEmailDelivery', () => {
  it('sends native and browser verification links with the same one-time token', async () => {
    const configValues = new Map<string, string>([
      ['AUTH_EMAIL_DELIVERY_MODE', 'smtp'],
      ['AUTH_ACTION_BASE_URL', 'https://app.example.test'],
      ['AUTH_EMAIL_FROM', 'auth@example.test'],
    ]);
    const config = {
      get: (key: string) => configValues.get(key),
    } as unknown as ConfigService;
    const delivery = new ConfigurableAuthEmailDelivery(config);
    const messages: Array<{ text: string; html: string }> = [];

    Object.defineProperty(delivery, 'smtp', {
      value: () => ({
        sendMail: (message: { text: string; html: string }) => {
          messages.push(message);
          return Promise.resolve();
        },
      }),
    });

    const token = 'V'.repeat(43);
    await delivery.sendEmailVerification({
      to: 'student@example.edu',
      token,
      expiresAt: new Date('2026-10-03T00:00:00.000Z'),
    });

    expect(messages).toHaveLength(1);
    const message = messages[0];
    expect(message).toBeDefined();
    const appLinkText = message.text.match(
      /losapuntes:\/\/verify-email\?token=[^\s]+/u,
    )?.[0];
    expect(appLinkText).toBeDefined();
    const appLink = new URL(appLinkText!);
    expect(appLink.protocol).toBe('losapuntes:');
    expect(appLink.hostname).toBe('verify-email');
    expect(appLink.searchParams.get('token')).toBe(token);

    const browserLinkText = message.text.match(
      /https:\/\/[^\s]+\/auth\/verify-email#token=[^\s]+/u,
    )?.[0];
    expect(browserLinkText).toBeDefined();
    const browserLink = new URL(browserLinkText!);
    expect(browserLink.origin).toBe('https://app.example.test');
    expect(browserLink.pathname).toBe('/auth/verify-email');
    expect(browserLink.search).toBe('');
    expect(new URLSearchParams(browserLink.hash.slice(1)).get('token')).toBe(
      token,
    );
    expect(message.html).toContain('Verificar email en la app móvil');
    expect(message.html).toContain('verificá desde el navegador');
  });

  it('keeps password recovery bearer out of the browser request target', async () => {
    const configValues = new Map<string, string>([
      ['AUTH_EMAIL_DELIVERY_MODE', 'smtp'],
      ['AUTH_ACTION_BASE_URL', 'https://app.example.test'],
      ['AUTH_EMAIL_FROM', 'auth@example.test'],
    ]);
    const config = {
      get: (key: string) => configValues.get(key),
    } as unknown as ConfigService;
    const delivery = new ConfigurableAuthEmailDelivery(config);
    const messages: Array<{ text: string; html: string }> = [];

    Object.defineProperty(delivery, 'smtp', {
      value: () => ({
        sendMail: (message: { text: string; html: string }) => {
          messages.push(message);
          return Promise.resolve();
        },
      }),
    });

    const token = 'R'.repeat(43);
    await delivery.sendPasswordRecovery({
      to: 'student@example.edu',
      token,
      expiresAt: new Date('2026-10-03T00:30:00.000Z'),
    });

    const message = messages[0];
    expect(message).toBeDefined();
    const linkText = message.text.match(
      /https:\/\/[^\s]+\/auth\/reset-password#token=[^\s]+/u,
    )?.[0];
    expect(linkText).toBeDefined();

    const link = new URL(linkText!);
    expect(link.origin).toBe('https://app.example.test');
    expect(link.pathname).toBe('/auth/reset-password');
    expect(link.search).toBe('');
    expect(new URLSearchParams(link.hash.slice(1)).get('token')).toBe(token);
  });
});
