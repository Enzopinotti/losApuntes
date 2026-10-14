import { Readable } from 'node:stream';

import {
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { AccountExportService } from './domain/account-export.service';
import { verifyAccountExportDownload } from './storage/account-export-download-integrity';
import { ACCOUNT_EXPORT_ARTIFACT_STORAGE } from './storage/account-export-artifact-storage';
import { type AccountExportArtifactStorage } from './storage/account-export-artifact-storage';

@Controller('account/exports')
@UseGuards(AuthSessionGuard)
export class AccountExportController {
  constructor(
    private readonly exports: AccountExportService,
    @Inject(ACCOUNT_EXPORT_ARTIFACT_STORAGE)
    private readonly artifacts: AccountExportArtifactStorage,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  request(@Req() request: AuthenticatedRequest) {
    return this.exports.request(request.user.id);
  }

  @Get(':id')
  async status(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const status = await this.exports.status(request.user.id, id);
    if (!status) throw new NotFoundException();
    return status;
  }

  @Get(':id/download')
  async download(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() reply: FastifyReply,
  ) {
    const artifact = await this.exports.download(request.user.id, id);
    if (artifact.kind === 'not_found') throw new NotFoundException();
    if (artifact.kind === 'not_ready') {
      throw new ConflictException({
        code: 'ACCOUNT_EXPORT_NOT_READY',
        message: 'Account export is not ready for download',
      });
    }
    if (artifact.kind === 'expired') {
      throw new GoneException({
        code: 'ACCOUNT_EXPORT_EXPIRED',
        message: 'Account export is no longer available',
      });
    }

    if (
      !artifact.generation ||
      !Number.isSafeInteger(artifact.byteLength) ||
      artifact.byteLength < 1 ||
      !/^[a-f0-9]{64}$/u.test(artifact.sha256)
    ) {
      throw new ForbiddenException();
    }

    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header(
        'content-disposition',
        'attachment; filename="los-apuntes-account-export-v1.json"',
      )
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-length', artifact.byteLength);

    const abort = new AbortController();
    const cleanup = () => {
      reply.raw.off('close', onClose);
      reply.raw.off('finish', cleanup);
    };
    const onClose = () => {
      cleanup();
      if (!reply.raw.writableFinished) abort.abort();
    };

    if (reply.raw.destroyed) {
      abort.abort();
    } else {
      reply.raw.once('close', onClose);
      reply.raw.once('finish', cleanup);
    }

    return reply.send(
      Readable.from(
        verifyAccountExportDownload(
          this.artifacts.readObjectChunks(
            id,
            artifact.generation,
            abort.signal,
          ),
          artifact.byteLength,
          artifact.sha256,
          abort.signal,
        ),
      ),
    );
  }
}
