export type SourceReviewStatus = 'unreviewed' | 'useful' | 'not_relevant';
export type ExperienceSource = {
  title?: string;
  url: string;
  excerpt?: string;
  publisher?: string;
  provider?: string;
  providers?: string[];
  sourceType?: string;
  alternativeFor?: string;
  publishedAt?: string | null;
  retrievedAt?: string | null;
  savedAt?: string;
  reviewStatus?: SourceReviewStatus;
  analystNote?: string;
  linkCheck?: {
    status?: 'reachable' | 'not_confirmed' | 'not_checked';
    checkedAt?: string | null;
    httpStatus?: number | null;
    finalUrl?: string | null;
    redirects?: Array<{ status: number; from: string; to: string }>;
    note?: string;
  };
};
export type ClaimAssessment = 'unreviewed' | 'supported' | 'conflicting' | 'insufficient';
export type ClaimEvidenceRole = 'supports' | 'challenges' | 'context';
export type ExperienceClaim = {
  claimId: string;
  text: string;
  assessment: ClaimAssessment;
  rationale: string;
  evidenceLinks: Array<{ url: string; role: ClaimEvidenceRole }>;
  createdAt?: string;
  updatedAt?: string;
};
export type ExperienceResearchRun = {
  runId: string;
  query: string;
  plannerKind: 'research' | 'plan' | 'compare' | 'create' | 'explore';
  sourceCount: number;
  successfulSearches: number;
  providerNames: string[];
  coverage: string;
  recordedAt: string;
};
