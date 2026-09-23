import { Injectable } from '@nestjs/common';

import { AcademicService } from '../../academic/domain/academic.service';
import { PilotEventService } from '../../pilot/telemetry/pilot-event.service';
import { ProfileService } from '../../profile/domain/profile.service';
import { ResourceService } from '../../resources/domain/resource.service';
import type {
  ContextualDiscoveryQueryDto,
  SearchQueryDto,
  SearchScope,
} from '../dto/search.dto';

function cleanQuery(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function includesScope(requested: SearchScope, scope: SearchScope): boolean {
  return requested === 'all' || requested === scope;
}

@Injectable()
export class SearchDiscoveryService {
  constructor(
    private readonly resources: ResourceService,
    private readonly academic: AcademicService,
    private readonly profiles: ProfileService,
    private readonly events: PilotEventService,
  ) {}

  async search(viewerUserId: string | undefined, dto: SearchQueryDto) {
    const query = cleanQuery(dto.q);
    const canonicalSubjectId =
      dto.subjectId && includesScope(dto.scope, 'resources')
        ? (await this.academic.resolveResourceContext(dto.subjectId)).subjectId
        : undefined;
    const results: {
      resources: Awaited<ReturnType<ResourceService['search']>>['items'];
      subjects: Array<{
        id: string;
        name: string;
        aliases: string[];
        kind: 'subject';
      }>;
      people: Array<{
        profileId: string;
        displayName: string;
        avatarUrl: string | null;
      }>;
    } = {
      resources: [],
      subjects: [],
      people: [],
    };

    await Promise.all([
      includesScope(dto.scope, 'resources')
        ? this.resources
            .search(viewerUserId, {
              q: query,
              ...(canonicalSubjectId ? { subjectId: canonicalSubjectId } : {}),
              limit: dto.limit,
            })
            .then((value) => {
              results.resources = value.items;
            })
        : Promise.resolve(),
      includesScope(dto.scope, 'subjects')
        ? this.academic
            .searchCatalog({
              kind: 'subject',
              q: query,
              limit: dto.limit,
            })
            .then((value) => {
              results.subjects = value.items.map((node) => ({
                id: node.id,
                name: node.name,
                aliases: node.aliases,
                kind: 'subject' as const,
              }));
            })
        : Promise.resolve(),
      includesScope(dto.scope, 'people')
        ? this.profiles.searchPublicProfiles(query, dto.limit).then((value) => {
            results.people = value.items;
          })
        : Promise.resolve(),
    ]);

    const resultCount =
      results.resources.length + results.subjects.length + results.people.length;

    await this.events.recordBestEffort({
      event: 'pilot.search_performed',
      ...(viewerUserId ? { userId: viewerUserId } : {}),
      ...(canonicalSubjectId ? { subjectId: canonicalSubjectId } : {}),
      resultCount,
    });

    return {
      query,
      scope: dto.scope,
      results,
    };
  }

  async contextual(userId: string, dto: ContextualDiscoveryQueryDto) {
    const participationResult =
      await this.academic.listSubjectParticipations(userId);
    const subjectIds = [
      ...new Set(
        participationResult.participations
          .filter((row) => row.state === 'current')
          .map((row) => row.subjectId),
      ),
    ]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, dto.subjectLimit * 2);

    const subjects = await Promise.all(
      subjectIds.map(async (subjectId) => {
        const [node, resources] = await Promise.all([
          this.academic.getCatalogNode(subjectId),
          this.resources.search(userId, {
            subjectId,
            limit: dto.resourcesPerSubject,
          }),
        ]);

        return {
          subject: {
            id: node.node.id,
            name: node.node.name,
          },
          resources: resources.items,
        };
      }),
    );

    subjects.sort(
      (left, right) =>
        left.subject.name.localeCompare(right.subject.name, 'es-AR', {
          sensitivity: 'base',
        }) || left.subject.id.localeCompare(right.subject.id),
    );

    return {
      subjects: subjects.slice(0, dto.subjectLimit),
    };
  }
}
