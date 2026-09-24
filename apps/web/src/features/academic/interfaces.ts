export type AcademicRelationshipRole =
  | "student"
  | "advanced_student"
  | "recent_graduate"
  | "alumni"
  | "mentor"
  | "teaching"
  | "research"
  | "community";

export type AcademicAffiliationStatus =
  | "applicant"
  | "active"
  | "paused"
  | "completed"
  | "withdrawn"
  | "alumni";

export type AcademicAffiliation = {
  id: string;
  institutionId: string;
  campusId?: string;
  academicUnitId?: string;
  programId?: string;
  curriculumId?: string;
  status: AcademicAffiliationStatus;
  roles: AcademicRelationshipRole[];
  startedOn?: string;
  endedOn?: string;
  createdAt: string;
  updatedAt: string;
};

export type AcademicFollow = {
  targetId: string;
  kind: "institution" | "program";
  name: string;
};

export type AcademicLifecyclePhase =
  | "student"
  | "alumni"
  | "mixed"
  | "community";

export type AcademicLifecycleResponse = {
  phase: AcademicLifecyclePhase;
  activeStudentAffiliationIds: string[];
  alumniAffiliationIds: string[];
  currentSubjectIds: string[];
  hasCurrentSubjectContext: boolean;
  currentAffiliationId: string | null;
  follows: AcademicFollow[];
};

export type AcademicCatalogNode = {
  id: string;
  kind:
    | "country"
    | "institution"
    | "campus"
    | "academic_unit"
    | "program"
    | "curriculum"
    | "subject"
    | "course_offering";
  name: string;
  aliases: string[];
  parentIds: string[];
  status: "active" | "inactive" | "merged";
};

export type AcademicCatalogSearchResponse = {
  items: AcademicCatalogNode[];
  nextCursor: string | null;
};
