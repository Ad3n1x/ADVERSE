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
export type PublicSearchResult={title:string;url:string;excerpt:string;publisher?:string;provider?:string;providers?:string[];publishedAt?:string|null;matchedQueries?:string[];indexSignals?:{indexed:boolean;lastSeenAt?:string|null;lastFetchedAt?:string|null;textScore?:number};linkCheck?:{status:'reachable'|'not_confirmed'|'not_checked';checkedAt?:string|null;note?:string};linkSignals?:{transport:string;hostname:string;signals:string[]}};
export type SearchHistoryEntry={query:string;searchedAt:string;resultCount:number};
export type WatchRecord={id:string;url:string;label:string;intervalHours:number;enabled:boolean;lastCaptureTimestamp?:string;lastCheckedAt?:string|null;nextCheckAt?:string|null;lastError?:string;createdAt?:string};
export type MonitorAlert={id:string;watchId:string;url?:string;label?:string;message?:string;observedAt?:string;acknowledgedAt?:string|null;previousCaptureTimestamp?:string;captureTimestamp?:string;emailStatus?:'pending'|'sent'|'disabled';emailAttempts?:number;emailLastError?:string};
export type CyberAssetRecord={id:string;url:string;hostname:string;label:string;intervalHours:number;enabled:boolean;lastCheckedAt?:string|null;nextCheckAt?:string|null;lastHttpStatus?:number|null;lastError?:string;authorizedByUser?:boolean;verificationToken?:string;verificationStatus?:'pending'|'verified';verifiedAt?:string|null};
export type CyberEventRecord={id:string;assetId:string;type:string;severity:string;title:string;message:string;url:string;observedAt?:string;acknowledgedAt?:string|null;details?:any};

