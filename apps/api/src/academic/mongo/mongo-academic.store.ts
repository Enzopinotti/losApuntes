import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientSession, Connection, FilterQuery, Model } from 'mongoose';

import type {
  AcademicAffiliationRecord,
  AcademicAuditEventRecord,
  AcademicCatalogNodeRecord,
  AcademicCatalogProposalRecord,
  AcademicCurrentContextRecord,
  AcademicProposalStatus,
  SubjectParticipationRecord,
} from '../domain/academic.types';
import { AcademicSourceIdentityConflictError } from '../domain/academic.store';
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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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
  private readonly transactionContext = new AsyncLocalStorage<ClientSession>();

  constructor(
    @InjectConnection()
    private readonly connection: Connection,
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

  async runAtomically<T>(operation: () => Promise<T>): Promise<T> {
    const existingSession = this.transactionContext.getStore();
    if (existingSession) return operation();

    return this.connection.transaction((session) =>
      this.transactionContext.run(session, operation),
    );
  }

  private session(): ClientSession | undefined {
    return this.transactionContext.getStore();
  }

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

  async findDirectRedirectSources(
    targetId: string,
  ): Promise<AcademicCatalogNodeRecord[]> {
    return this.catalog
      .find({ status: 'merged', redirectToId: targetId })
      .sort({ id: 1 })
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
    if (query.parentIds && query.parentIds.length > 0) {
      clauses.push({ parentIds: { $in: query.parentIds } });
    }

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
    const session = this.session();

    try {
      const created = session
        ? (await this.catalog.create([input], { session }))[0]
        : await this.catalog.create(input);
      return toPlain<AcademicCatalogNodeRecord>(created);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AcademicSourceIdentityConflictError();
      }
      throw error;
    }
  }

  async updateCatalogNode(
    id: string,
    expectedRevision: number,
    patch: UpdateCatalogNodeRecord,
  ): Promise<AcademicCatalogNodeRecord | null> {
    try {
      return await this.catalog
        .findOneAndUpdate(
          { id, revision: expectedRevision },
          { $set: patch, $inc: { revision: 1 } },
          { new: true, session: this.session() },
        )
        .lean<AcademicCatalogNodeRecord>()
        .exec();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AcademicSourceIdentityConflictError();
      }
      throw error;
    }
  }

  async createAffiliation(
    input: CreateAffiliationRecord,
  ): Promise<AcademicAffiliationRecord> {
    const session = this.session();
    const created = session
      ? (await this.affiliations.create([input], { session }))[0]
      : await this.affiliations.create(input);
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
      .findOneAndUpdate(
        { id, userId },
        { $set: update },
        { new: true, session: this.session() },
      )
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
        { upsert: true, new: true, session: this.session() },
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
        { upsert: true, new: true, session: this.session() },
      )
      .lean<AcademicCurrentContextRecord>()
      .exec();

    if (!row) throw new Error('Academic current context upsert failed');
    return row;
  }

  async createProposal(
    input: CreateProposalRecord,
  ): Promise<AcademicCatalogProposalRecord> {
    const session = this.session();
    const created = session
      ? (await this.proposals.create([input], { session }))[0]
      : await this.proposals.create(input);
    return toPlain<AcademicCatalogProposalRecord>(created);
  }

  async findProposalById(
    id: string,
  ): Promise<AcademicCatalogProposalRecord | null> {
    return this.proposals
      .findOne({ id })
      .lean<AcademicCatalogProposalRecord>()
      .exec();
  }

  async listProposals(
    status: AcademicProposalStatus | undefined,
    limit: number,
  ): Promise<AcademicCatalogProposalRecord[]> {
    return this.proposals
      .find(status ? { status } : {})
      .sort({ createdAt: 1, id: 1 })
      .limit(limit)
      .lean<AcademicCatalogProposalRecord[]>()
      .exec();
  }

  async reviewProposal(
    id: string,
    reviewerUserId: string,
    status: Exclude<AcademicProposalStatus, 'pending'>,
    reason: string,
    canonicalTargetId?: string,
  ): Promise<AcademicCatalogProposalRecord | null> {
    const reviewedAt = new Date();

    return this.proposals
      .findOneAndUpdate(
        { id, status: 'pending' },
        {
          $set: {
            status,
            reviewedByUserId: reviewerUserId,
            reviewReason: reason,
            canonicalTargetId,
            reviewedAt,
          },
        },
        { new: true, session: this.session() },
      )
      .lean<AcademicCatalogProposalRecord>()
      .exec();
  }

  async appendAuditEvent(input: AcademicAuditEventRecord): Promise<void> {
    const session = this.session();

    if (session) {
      await this.audit.create([input], { session });
      return;
    }

    await this.audit.create(input);
  }
}
