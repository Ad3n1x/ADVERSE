import { registerInvestigationCoreRoutes } from './investigation-core.routes.js';
import { registerInvestigationAnalysisRoutes } from './investigation-analysis.routes.js';
import { registerInvestigationRecordRoutes } from './investigation-records.routes.js';

export function registerInvestigationRoutes(app, deps) {
  registerInvestigationCoreRoutes(app, deps);
  registerInvestigationAnalysisRoutes(app, deps);
  registerInvestigationRecordRoutes(app, deps);
}
