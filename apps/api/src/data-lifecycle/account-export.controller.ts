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
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import {
  AccountExportService,
  type AccountExportDownload,
} from './domain/account-export.service';
import { reauthorizeAccountExportDownload } from './domain/account-export-download-reauthorization';
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
      ![1, 2, 3].includes(artifact.formatVersion) ||
      !Number.isSafeInteger(artifact.byteLength) ||
      artifact.byteLength < 1 ||
      !/^[a-f0-9]{64}$/u.test(artifact.sha256)
    ) {
      throw new ForbiddenException();
    }

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

    // B91: B90 verifies the object immediately after upload, and the
    // response stream checks it again as bytes are sent. Neither guard
    // alone prevents a mutated/truncated object from sending *some*
    // private bytes before a streaming digest mismatch is discovered.
    //
    // Perform a bounded, streaming preflight GET before writing headers.
    // A missing, corrupt or unreadable object yields a stable 503 instead
    // of starting an attachment that is already known to be invalid.
    try {
      await this.artifacts.verifyReadable(
        id,
        artifact.generation,
        { byteLength: artifact.byteLength, sha256: artifact.sha256 },
        abort.signal,
      );
      if (abort.signal.aborted) {
        throw new Error('Download connection closed before preflight');
      }
    } catch {
      cleanup();
      abort.abort();
      // Do not expose object keys, storage credentials or provider errors.
      throw new ServiceUnavailableException({
        code: 'ACCOUNT_EXPORT_STORAGE_UNAVAILABLE',
        message: 'The account export could not be verified for download',
      });
    }

    // B92: the owner/account and artifact reference may have changed
    // during the full S3 preflight (account closure, TTL retirement or
    // generation replacement). Recheck the CURRENT durable authorization
    // before emitting any headers, not the snapshot captured before GET.
    let latest: AccountExportDownload;
    try {
      latest = await this.exports.download(request.user.id, id);
    } catch (error) {
      cleanup();
      abort.abort();
      throw error;
    }
    const authority = reauthorizeAccountExportDownload(artifact, latest);
    if (authority !== 'unchanged' || abort.signal.aborted) {
      cleanup();
      abort.abort();
      if (authority === 'not_found') throw new NotFoundException();
      if (authority === 'not_ready') {
        throw new ConflictException({
          code: 'ACCOUNT_EXPORT_NOT_READY',
          message: 'Account export is not ready for download',
        });
      }
      if (authority === 'expired') {
        throw new GoneException({
          code: 'ACCOUNT_EXPORT_EXPIRED',
          message: 'Account export is no longer available',
        });
      }
      if (authority === 'changed') {
        throw new ConflictException({
          code: 'ACCOUNT_EXPORT_CHANGED_DURING_VERIFICATION',
          message:
            'Account export changed during download verification. Retry the request.',
        });
      }
      // A disconnected client must never start a late response, even if
      // account and artifact metadata are still valid.
      throw new ServiceUnavailableException({
        code: 'ACCOUNT_EXPORT_STORAGE_UNAVAILABLE',
        message: 'The account export could not be verified for download',
      });
    }

    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="los-apuntes-account-export-v${artifact.formatVersion}.json"`,
      )
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-length', artifact.byteLength);

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
