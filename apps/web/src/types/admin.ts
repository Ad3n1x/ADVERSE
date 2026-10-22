export type AdminUser = { id: string; email: string; displayName: string; role?: 'owner' | 'admin' | 'user'; status?: 'active' | 'suspended'; createdAt?: string; lastUpdatedAt?: string; investigations: number };
export type AdminOverview = { metrics: { totalUsers: number; totalInvestigations: number; usersCreatedLast7Days: number }; recentUsers: AdminUser[]; generatedAt: string; limitations: string[] };
export type AdminTab = 'overview' | 'users' | 'search' | 'providers' | 'incidents' | 'jobs' | 'settings' | 'security';
export type AdminConfig = { maintenanceMode: boolean; featureFlags: { search: boolean; providerSettings: boolean; monitoring: boolean }; usageLimits: { searchesPerMinute: number }; retentionDays: number };
