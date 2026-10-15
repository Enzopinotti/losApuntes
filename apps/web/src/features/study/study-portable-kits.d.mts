import type { StudySession } from "./study-session-plan.mjs";
export type PortableStudyKit = {
  id: string;
  title: string;
  notes: string;
  resourceIds: string[];
};
export type PortableStudyKitArchive = {
  format: "losapuntes.portable-study-kits";
  version: 1;
  subjectId: string;
  kits: PortableStudyKit[];
};
export declare const STUDY_KIT_FORMAT: "losapuntes.portable-study-kits";
export declare const STUDY_KIT_VERSION: 1;
export declare const STUDY_KIT_MAX_COLLECTIONS: 12;
export declare const STUDY_KIT_MAX_RESOURCES: 24;
export declare const STUDY_KIT_MAX_FILE_BYTES: number;
export declare function normalizeStudyKitArchive(input: unknown): PortableStudyKitArchive;
export declare function emptyStudyKitArchive(subjectId: string): PortableStudyKitArchive;
export declare function readStudyKitArchive(source: string): PortableStudyKitArchive;
export declare function serializeStudyKitArchive(archive: PortableStudyKitArchive): string;
export declare function createStudyKit(archive: PortableStudyKitArchive, input: {id:string;title:string;notes:string}): PortableStudyKitArchive;
export declare function changeStudyKit(archive: PortableStudyKitArchive, kitId: string, changes: {title?:string;notes?:string}): PortableStudyKitArchive;
export declare function deleteStudyKit(archive: PortableStudyKitArchive, kitId: string): PortableStudyKitArchive;
export declare function addStudyKitResource(archive: PortableStudyKitArchive, kitId:string, resourceId:string): PortableStudyKitArchive;
export declare function removeStudyKitResource(archive: PortableStudyKitArchive, kitId:string, resourceId:string): PortableStudyKitArchive;
export declare function moveStudyKitResource(archive: PortableStudyKitArchive, kitId:string, index:number, delta:-1|1): PortableStudyKitArchive;
export declare function studyKitToSession(archive: PortableStudyKitArchive, kitId:string): StudySession;
