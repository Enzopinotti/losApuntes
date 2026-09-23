import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';

import type {
  AcademicAffiliationRecord,
  AcademicAuditEventRecord,
  AcademicCatalogNodeRecord,
  AcademicCatalogProposalRecord,
  AcademicCurrentContextRecord,
  SubjectParticipationRecord,
} from '../domain/academic.types';
import type {
  AcademicStore,
  CatalogSearchQuery,
  CatalogSearchResult,
  CreateAffiliationRecord,
  CreateCatalogNodeRecord,
  CreateProposalRecord,
  CreateSubjectParticipationRecord,
  UpdateCatalogNodeRecord,
} from '../domain/academic.store';
import {
  AcademicAffiliation,
  AcademicAuditEvent,
  AcademicCatalogNode,
  AcademicCatalogProposal,
  AcademicCurrentContext,
  AcademicSubjectParticipation,
} from './academic.mongo-schemas';

function escapeRegex(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/gu, '\\$&');
}

function toPlain<T>(value: { toObject(): unknown } | T): T {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toObject' in value &&
    typeof value.toObject === 'function'
  ) {
    return value.toObject() as T;
  }

  return value as T;
}

@Injectable()
export class MongoAcademicStore implements AcademicStore {
  constructor(
    @InjectModel(AcademicCatalogNode.name)
    private readonly catalog: Model<AcademicCatalogNode>,
    @InjectModel(AcademicAffiliation.name)
    private readonly affiliations: Model<AcademicAffiliation>,
    @InjectModel(AcademicSubjectParticipation.name)
    private readonly participations: Model<AcademicSubjectParticipation>,
    @InjectModel(AcademicCurrentContext.name)
    private readonly contexts: Model<AcademicCurrentContext>,
    @InjectModel(AcademicCatalogProposal.name)
    private readonly proposals: Model<AcademicCatalogProposal>,
    @InjectModel(AcademicAuditEvent.name)
    private readonly audit: Model<AcademicAuditEvent>,
  ) {}

  async findCatalogNodeById(
    id: string,
  ): Promise<AcademicCatalogNodeRecord | null> {
    return this.catalog
      .findOne({ id })
      .lean<AcademicCatalogNodeRecord>()
      .exec();
  }

  async findCatalogNodesByIds(
    ids: string[],
  ): Promise<AcademicCatalogNodeRecord[]> {
    if (ids.length === 0) return [];
    return this.catalog
      .find({ id: { $in: ids } })
      .lean<AcademicCatalogNodeRecord[]>()
      .exec();
  }

  async findCatalogNodeBySourceIdentity(
    sourceKey: string,
    externalId: string,
  ): Promise<AcademicCatalogNodeRecord | null> {
    return this.catalog
      .findOne({
        'provenance.sourceKey': sourceKey,
        'provenance.externalId': externalId,
      })
      .lean<AcademicCatalogNodeRecord>()
      .exec();
  }

  async searchCatalog(query: CatalogSearchQuery): Promise<CatalogSearchResult> {
    const clauses: FilterQuery<AcademicCatalogNode>[] = [{ status: 'active' }];

    if (query.kind) clauses.push({ kind: query.kind });
    if (query.parentId) clauses.push({ parentIds: query.parentId });

    if (query.q) {
      const prefix = new RegExp('^' + escapeRegex(query.q), 'u');
      clauses.push({
        $or: [{ normalizedName: prefix }, { normalizedAliases: prefix }],
      });
    }

    if (query.after) {
      clauses.push({
        $or: [
          { normalizedName: { $gt: query.after.normalizedName } },
          {
            normalizedName: query.after.normalizedName,
            id: { $gt: query.after.id },
          },
        ],
      });
    }

    const rows = await this.catalog
      .find({ $and: clauses })
      .sort({ normalizedName: 1, id: 1 })
      .limit(query.limit + 1)
      .lean<AcademicCatalogNodeRecord[]>()
      .exec();

    return {
      items: rows.slice(0, query.limit),
      hasMore: rows.length > query.limit,
    };
  }

  async createCatalogNode(
    input: CreateCatalogNodeRecord,
  ): Promise<AcademicCatalogNodeRecord> {
    const created = await this.catalog.create(input);
    return toPlain<AcademicCatalogNodeRecord>(created);
  }

  async updateCatalogNode(
    id: string,
    expectedRevision: number,
    patch: UpdateCatalogNodeRecord,
  ): Promise<AcademicCatalogNodeRecord | null> {
    return this.catalog
      .findOneAndUpdate(
        { id, revision: expectedRevision },
        { $set: patch, $inc: { revision: 1 } },
        { new: true },
      )
      .lean<AcademicCatalogNodeRecord>()
      .exec();
  }

  async createAffiliation(
    input: CreateAffiliationRecord,
  ): Promise<AcademicAffiliationRecord> {
    const created = await this.affiliations.create(input);
    return toPlain<AcademicAffiliationRecord>(created);
  }

  async findAffiliationById(
    id: string,
  ): Promise<AcademicAffiliationRecord | null> {
    return this.affiliations
      .findOne({ id })
      .lean<AcademicAffiliationRecord>()
      .exec();
  }

  async listAffiliationsForUser(
    userId: string,
  ): Promise<AcademicAffiliationRecord[]> {
    return this.affiliations
      .find({ userId })
      .sort({ updatedAt: -1, id: 1 })
      .lean<AcademicAffiliationRecord[]>()
      .exec();
  }

  async updateAffiliationStatus(
    userId: string,
    id: string,
    status: AcademicAffiliationRecord['status'],
    endedOn?: string,
  ): Promise<AcademicAffiliationRecord | null> {
    const update: Record<string, unknown> = { status };
    if (endedOn !== undefined) update.endedOn = endedOn;

    return this.affiliations
      .findOneAndUpdate({ id, userId }, { $set: update }, { new: true })
      .lean<AcademicAffiliationRecord>()
      .exec();
  }

  async upsertSubjectParticipation(
    input: CreateSubjectParticipationRecord,
  ): Promise<SubjectParticipationRecord> {
    const courseOfferingId = input.courseOfferingId ?? null;

    const row = await this.participations
      .findOneAndUpdate(
        {
          userId: input.userId,
          subjectId: input.subjectId,
          courseOfferingId,
        },
        {
          $set: {
            state: input.state,
            periodLabel: input.periodLabel,
          },
          $setOnInsert: {
            id: input.id,
            userId: input.userId,
            subjectId: input.subjectId,
            courseOfferingId,
          },
        },
        { upsert: true, new: true },
      )
      .lean<SubjectParticipationRecord>()
      .exec();

    if (!row) throw new Error('Academic subject participation upsert failed');
    return row;
  }

  async findSubjectParticipationById(
    id: string,
  ): Promise<SubjectParticipationRecord | null> {
    return this.participations
      .findOne({ id })
      .lean<SubjectParticipationRecord>()
      .exec();
  }

  async listSubjectParticipationsForUser(
    userId: string,
  ): Promise<SubjectParticipationRecord[]> {
    return this.participations
      .find({ userId })
      .sort({ updatedAt: -1, id: 1 })
      .lean<SubjectParticipationRecord[]>()
      .exec();
  }

  async getCurrentContext(
    userId: string,
  ): Promise<AcademicCurrentContextRecord | null> {
    return this.contexts
      .findOne({ userId })
      .lean<AcademicCurrentContextRecord>()
      .exec();
  }

  async setCurrentContext(
    input: Omit<AcademicCurrentContextRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AcademicCurrentContextRecord> {
    const row = await this.contexts
      .findOneAndUpdate(
        { userId: input.userId },
        {
          $set: {
            affiliationId: input.affiliationId,
            subjectParticipationId: input.subjectParticipationId,
          },
          $setOnInsert: { userId: input.userId },
        },
        { upsert: true, new: true },
      )
      .lean<AcademicCurrentContextRecord>()
      .exec();

    if (!row) throw new Error('Academic current context upsert failed');
    return row;
  }

  async createProposal(
    input: CreateProposalRecord,
  ): Promise<AcademicCatalogProposalRecord> {
    const created = await this.proposals.create(input);
    return toPlain<AcademicCatalogProposalRecord>(created);
  }

  async appendAuditEvent(input: AcademicAuditEventRecord): Promise<void> {
    await this.audit.create(input);
  }
}
