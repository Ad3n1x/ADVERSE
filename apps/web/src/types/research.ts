// Shared client-side domain contracts. Keep API response fields aligned with apps/api.
export type Investigation={id:string;title:string;question:string;createdAt:string;status:string;notes?:string};
export type Evidence={id?:string;_id?:string;title:string;url:string;sourceType:string;publisher:string;publishedAt?:string|null;retrievedAt:string;excerpt:string;verificationStatus:string;captureTimestamp?:string};
export type Entity={id?:string;_id?:string;name:string;type:string;description:string;canonicalUrl:string;evidenceIds:string[]};
export type Relationship={id?:string;_id?:string;fromEntityId:string;toEntityId:string;type:string;evidenceIds:string[];confidence:string;rationale:string;verificationStatus:string};
export type SearchResult={title:string;url:string;excerpt:string;publisher:string;retrievedAt:string;publishedAt?:string|null;sourceType:string;provider?:string;providers?:string[];matchedQueries?:string[];queryReasons?:string[];providerErrors?:string[];imageUrl?:string;thumbnailUrl?:string;license?:string;entityId?:string;videoId?:string;linkCheck?:{status:'reachable'|'not_confirmed'|'not_checked';checkedAt:string|null;note:string};linkSignals?:{transport:string;hostname:string;signals:string[]};sourceContext?:{host:string;category:string;label:string;reason:string;signals:string[]};corroboration?:{independentMatches:number;domains:string[];method:string}};
export type Capture={timestamp:string;original:string;statuscode:string;archivedUrl:string};
export type Tab='Intelligence Desk'|'Settings';
export type ToastKind='success'|'error'|'info';
export type ToastItem={id:number;message:string;kind:ToastKind};
