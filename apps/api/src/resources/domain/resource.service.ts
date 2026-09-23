import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AcademicService } from '../../academic/domain/academic.service';
import { FileService } from '../../files/domain/file.service';
import { ProfileService } from '../../profile/domain/profile.service';
import type {
  CreateResourceDto,
  ResourceSearchDto,
  UpdateResourceDto,
} from '../dto/resource.dto';
import {
  RESOURCE_STORE,
  ResourceAssetUnavailableError,
  type ResourceStore,
} from './resource.store';
import type { ResourceRecord, ResourceSearchCursor } from './resource.types';

function cleanText(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function cleanNullable(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es-AR');
}

function cleanTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const tag = cleanText(raw);
    const key = normalized(tag);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(tag);
  }

  return output;
}

function searchText(input: {
  title: string;
  description: string | null;
  tags: readonly string[];
}): string {
  return normalized(
    [input.title, input.description ?? '', ...input.tags].join(' '),
  );
}

function encodeCursor(cursor: ResourceSearchCursor): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(value?: string): ResourceSearchCursor | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    if (typeof parsed.updatedAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('Invalid cursor');
    }

    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) throw new Error('Invalid date');

    return { updatedAt, id: parsed.id };
  } catch {
    throw new UnprocessableEntityException({
      code: 'RESOURCE_CURSOR_INVALID',
      message: 'Resource cursor is invalid',
    });
  }
}

@Injectable()
export class ResourceService {
  constructor(
    @Inject(RESOURCE_STORE)
    private readonly store: ResourceStore,
    private readonly files: FileService,
    private readonly academic: AcademicService,
    private readonly profiles: ProfileService,
  ) {}

  async create(userId: string, dto: CreateResourceDto, now = new Date()) {
    const context = await this.academic.resolveResourceContext(
      dto.subjectId,
      dto.courseOfferingId,
    );
    const title = cleanText(dto.title);
    const description =
      dto.description === undefined ? null : cleanNullable(dto.description);
    const tags = cleanTags(dto.tags ?? []);
    const id = randomUUID();

    try {
      const created = await this.store.createClaimingAsset({
        actorUserId: userId,
        now,
        resource: {
          id,
          authorUserId: userId,
          assetId: dto.assetId,
          title,
          description,
          tags,
          searchText: searchText({ title, description, tags }),
          subjectId: context.subjectId,
          courseOfferingId: context.courseOfferingId,
          visibility: dto.visibility,
          moderationState: 'available',
          revision: 1,
        },
      });

      return {
        resource: await this.projection(created.resource, userId),
      };
    } catch (error) {
      if (error instanceof ResourceAssetUnavailableError) {
        throw new ConflictException({
          code: 'RESOURCE_ASSET_UNAVAILABLE',
          message: 'File asset is not ready or was already claimed',
        });
      }

      throw error;
    }
  }

  async get(id: string, viewerUserId?: string) {
    const resource = await this.requireReadable(id, viewerUserId);
    return {
      resource: await this.projection(resource, viewerUserId),
    };
  }

  async search(viewerUserId: string | undefined, dto: ResourceSearchDto) {
    const canonicalSubjectId = dto.subjectId
      ? (await this.academic.resolveResourceContext(dto.subjectId)).subjectId
      : undefined;
    const result = await this.store.searchAuthorized({
      viewerUserId,
      ...(dto.q ? { q: normalized(dto.q) } : {}),
      ...(canonicalSubjectId ? { subjectId: canonicalSubjectId } : {}),
      ...(dto.visibility ? { visibility: dto.visibility } : {}),
      limit: dto.limit,
      after: decodeCursor(dto.cursor),
    });
    const last = result.items.at(-1);

    return {
      items: await Promise.all(
        result.items.map((row) => this.projection(row, viewerUserId)),
      ),
      nextCursor:
        result.hasMore && last
          ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }

  async update(userId: string, id: string, dto: UpdateResourceDto) {
    const existing = await this.requireOwned(id, userId);
    const patch: {
      title?: string;
      description?: string | null;
      tags?: string[];
      searchText?: string;
      visibility?: ResourceRecord['visibility'];
    } = {};

    if (dto.title !== undefined) patch.title = cleanText(dto.title);
    if (dto.description !== undefined) {
      patch.description = cleanNullable(dto.description);
    }
    if (dto.tags !== undefined) patch.tags = cleanTags(dto.tags);
    if (dto.visibility !== undefined) patch.visibility = dto.visibility;

    if (
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.tags !== undefined
    ) {
      const nextTitle = patch.title ?? existing.title;
      const nextDescription =
        dto.description !== undefined
          ? (patch.description ?? null)
          : existing.description;
      const nextTags = patch.tags ?? existing.tags;
      patch.searchText = searchText({
        title: nextTitle,
        description: nextDescription,
        tags: nextTags,
      });
    }

    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({
        code: 'RESOURCE_UPDATE_EMPTY',
        message: 'Resource update contains no changes',
      });
    }

    const updated = await this.store.updateOwned(
      id,
      userId,
      dto.expectedRevision,
      patch,
    );

    if (!updated) {
      throw new ConflictException({
        code: 'RESOURCE_REVISION_CONFLICT',
        message: 'Resource changed concurrently',
      });
    }

    return { resource: await this.projection(updated, userId) };
  }

  async grantShare(userId: string, id: string, profileId: string) {
    const resource = await this.requireOwned(id, userId);
    if (resource.visibility !== 'shared') {
      throw new ConflictException({
        code: 'RESOURCE_SHARE_VISIBILITY_REQUIRED',
        message: 'Resource must be shared before granting explicit access',
      });
    }

    const targetUserId =
      await this.profiles.resolveUserIdByProfileId(profileId);
    if (!targetUserId) this.notFound();
    if (targetUserId === userId) {
      throw new UnprocessableEntityException({
        code: 'RESOURCE_SHARE_SELF',
        message: 'Author does not need an explicit share grant',
      });
    }

    await this.store.upsertShare(id, targetUserId);
    return { shared: true };
  }

  async revokeShare(userId: string, id: string, profileId: string) {
    await this.requireOwned(id, userId);
    const targetUserId =
      await this.profiles.resolveUserIdByProfileId(profileId);
    if (!targetUserId) return;
    await this.store.removeShare(id, targetUserId);
  }

  async save(userId: string, id: string) {
    await this.requireReadable(id, userId);
    await this.store.upsertSave(id, userId);
    return { saved: true };
  }

  async unsave(userId: string, id: string): Promise<void> {
    await this.store.removeSave(id, userId);
  }

  async listSaved(userId: string, limit: number) {
    const ids = await this.store.listSavedResourceIds(userId, limit);
    const rows = await this.store.findManyByIds(ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const visible: ResourceRecord[] = [];

    for (const id of ids) {
      const row = byId.get(id);
      if (row && (await this.canRead(row, userId))) visible.push(row);
    }

    return {
      items: await Promise.all(
        visible.map((row) => this.projection(row, userId)),
      ),
    };
  }

  async createAccessIntent(
    userId: string,
    id: string,
    disposition: 'inline' | 'attachment',
  ) {
    const resource = await this.requireReadable(id, userId);
    const asset = await this.files.getReadyAssetForResource(resource.assetId);
    if (!asset) {
      throw new ServiceUnavailableException({
        code: 'RESOURCE_UNAVAILABLE',
        message: 'Resource file is temporarily unavailable',
      });
    }

    const access = await this.files.createAuthorizedDownloadIntent({
      asset,
      filename: asset.originalFilename,
      disposition,
    });

    return {
      file: {
        id: asset.id,
        filename: asset.originalFilename,
        mimeType: asset.verifiedMimeType,
        byteSize: asset.actualByteSize,
      },
      access,
    };
  }

  async report(
    userId: string,
    id: string,
    reason: Parameters<ResourceStore['upsertPendingReport']>[0]['reason'],
    details?: string | null,
  ) {
    await this.requireReadable(id, userId);
    const report = await this.store.upsertPendingReport({
      id: randomUUID(),
      resourceId: id,
      reporterUserId: userId,
      reason,
      details: details === undefined ? null : cleanNullable(details),
    });

    return {
      report: {
        id: report.id,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      },
    };
  }

  private async requireOwned(
    id: string,
    userId: string,
  ): Promise<ResourceRecord> {
    const row = await this.store.findById(id);
    if (!row || row.authorUserId !== userId) this.notFound();
    return row;
  }

  private async requireReadable(
    id: string,
    viewerUserId?: string,
  ): Promise<ResourceRecord> {
    const row = await this.store.findById(id);
    if (!row || !(await this.canRead(row, viewerUserId))) this.notFound();
    return row;
  }

  private async canRead(
    resource: ResourceRecord,
    viewerUserId?: string,
  ): Promise<boolean> {
    if (resource.moderationState !== 'available') return false;
    if (resource.authorUserId === viewerUserId) return true;
    if (resource.visibility === 'public') return true;
    if (!viewerUserId || resource.visibility !== 'shared') return false;

    return this.store.hasShare(resource.id, viewerUserId);
  }

  private async projection(resource: ResourceRecord, viewerUserId?: string) {
    const [asset, author, subject, offering] = await Promise.all([
      this.files.getReadyAssetForResource(resource.assetId),
      this.profiles.getAttributionForUser(resource.authorUserId),
      this.academic.getCatalogNode(resource.subjectId),
      resource.courseOfferingId
        ? this.academic.getCatalogNode(resource.courseOfferingId)
        : Promise.resolve(null),
    ]);

    if (
      !asset ||
      !asset.verifiedMimeType ||
      asset.actualByteSize === undefined
    ) {
      throw new ServiceUnavailableException({
        code: 'RESOURCE_UNAVAILABLE',
        message: 'Resource file is temporarily unavailable',
      });
    }

    return {
      id: resource.id,
      title: resource.title,
      description: resource.description,
      tags: resource.tags,
      visibility: resource.visibility,
      author,
      academic: {
        subject: {
          id: subject.node.id,
          name: subject.node.name,
        },
        courseOffering: offering
          ? {
              id: offering.node.id,
              name: offering.node.name,
            }
          : null,
      },
      file: {
        id: asset.id,
        filename: asset.originalFilename,
        mimeType: asset.verifiedMimeType,
        byteSize: asset.actualByteSize,
      },
      capabilities: {
        edit: resource.authorUserId === viewerUserId,
        manageShares: resource.authorUserId === viewerUserId,
      },
      revision: resource.revision,
      createdAt: resource.createdAt.toISOString(),
      updatedAt: resource.updatedAt.toISOString(),
    };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Resource was not found',
    });
  }
}
