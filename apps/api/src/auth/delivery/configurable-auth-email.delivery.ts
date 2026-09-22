import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { requireConfigString } from '../../config/required-config';
import type {
  AuthEmailActionMessage,
  AuthEmailDelivery,
  AuthEmailSecurityNotice,
} from './auth-email-delivery.types';

type AuthEmailDeliveryMode = 'disabled' | 'smtp';

function actionUrl(
  baseUrl: string,
  path: string,
  token: string,
): string {
  const url = new URL(path, baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

function expirationText(expiresAt: Date): string {
  return expiresAt.toISOString();
}

@Injectable()
export class ConfigurableAuthEmailDelivery implements AuthEmailDelivery {
  private transporter: Transporter | undefined;

  constructor(private readonly config: ConfigService) {}

  async sendEmailVerification(
    message: AuthEmailActionMessage,
  ): Promise<void> {
    if (this.mode() === 'disabled') return;

    const link = actionUrl(
      this.actionBaseUrl(),
      '/auth/verify-email',
      message.token,
    );
    const expires = expirationText(message.expiresAt);

    await this.smtp().sendMail({
      from: this.from(),
      to: message.to,
      subject: 'Verificá tu email en Los Apuntes',
      text: [
        'Verificá tu email para activar tu cuenta de Los Apuntes.',
        '',
        link,
        '',
        `Este enlace vence el ${expires}.`,
        'Si no creaste esta cuenta, podés ignorar este mensaje.',
      ].join('\n'),
      html: [
        '<p>Verificá tu email para activar tu cuenta de Los Apuntes.</p>',
        `<p><a href="${link}">Verificar email</a></p>`,
        `<p>Este enlace vence el ${expires}.</p>`,
        '<p>Si no creaste esta cuenta, podés ignorar este mensaje.</p>',
      ].join(''),
    });
  }

  async sendPasswordRecovery(
    message: AuthEmailActionMessage,
  ): Promise<void> {
    if (this.mode() === 'disabled') return;

    const link = actionUrl(
      this.actionBaseUrl(),
      '/auth/reset-password',
      message.token,
    );
    const expires = expirationText(message.expiresAt);

    await this.smtp().sendMail({
      from: this.from(),
      to: message.to,
      subject: 'Recuperá tu acceso a Los Apuntes',
      text: [
        'Recibimos una solicitud para cambiar tu contraseña de Los Apuntes.',
        '',
        link,
        '',
        `Este enlace vence el ${expires}.`,
        'Si no pediste este cambio, ignorá este mensaje.',
      ].join('\n'),
      html: [
        '<p>Recibimos una solicitud para cambiar tu contraseña de Los Apuntes.</p>',
        `<p><a href="${link}">Cambiar contraseña</a></p>`,
        `<p>Este enlace vence el ${expires}.</p>`,
        '<p>Si no pediste este cambio, ignorá este mensaje.</p>',
      ].join(''),
    });
  }

  async sendPasswordRecoveryCompleted(
    message: AuthEmailSecurityNotice,
  ): Promise<void> {
    if (this.mode() === 'disabled') return;

    await this.smtp().sendMail({
      from: this.from(),
      to: message.to,
      subject: 'Tu contraseña de Los Apuntes fue actualizada',
      text: [
        'Tu contraseña de Los Apuntes fue actualizada.',
        '',
        'Cerramos las sesiones anteriores. Volvé a iniciar sesión para continuar.',
        'Si no hiciste este cambio, contactá soporte desde los canales oficiales.',
      ].join('\n'),
      html: [
        '<p>Tu contraseña de Los Apuntes fue actualizada.</p>',
        '<p>Cerramos las sesiones anteriores. Volvé a iniciar sesión para continuar.</p>',
        '<p>Si no hiciste este cambio, contactá soporte desde los canales oficiales.</p>',
      ].join(''),
    });
  }

  private mode(): AuthEmailDeliveryMode {
    return (
      this.config.get<AuthEmailDeliveryMode>('AUTH_EMAIL_DELIVERY_MODE') ??
      'disabled'
    );
  }

  private actionBaseUrl(): string {
    return requireConfigString(this.config, 'AUTH_ACTION_BASE_URL');
  }

  private from(): string {
    return requireConfigString(this.config, 'AUTH_EMAIL_FROM');
  }

  private smtp(): Transporter {
    if (this.transporter) return this.transporter;

    const user = this.config.get<string>('AUTH_SMTP_USER')?.trim();
    const pass = this.config.get<string>('AUTH_SMTP_PASS')?.trim();

    this.transporter = nodemailer.createTransport({
      host: requireConfigString(this.config, 'AUTH_SMTP_HOST'),
      port: this.config.getOrThrow<number>('AUTH_SMTP_PORT'),
      secure: this.config.getOrThrow<boolean>('AUTH_SMTP_SECURE'),
      auth: user && pass ? { user, pass } : undefined,
      pool: true,
      maxConnections: 2,
      maxMessages: 100,
    });

    return this.transporter;
  }
}
