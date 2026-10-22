import { createUtilityController } from '../controllers/utility.controller.js';

export function registerUtilityRoutes(app, dependencies) {
  const controller = createUtilityController(dependencies);
  const { limitProvider, wrap, requireAuth } = dependencies;

  app.get('/api/v1/organizations/search', limitProvider, wrap(controller.searchOrganizationsHandler));
  app.get('/api/v1/archives', limitProvider, wrap(controller.archivesHandler));
  app.get('/api/v1/archives/compare', limitProvider, wrap(controller.compareArchivesHandler));
  app.get('/api/v1/domains', limitProvider, wrap(controller.domainsHandler));
  app.get('/api/v1/investigations/:id/timeline', requireAuth, wrap(controller.timelineHandler));
  app.get('/api/v1/investigations/:id/history/graph', requireAuth, wrap(controller.historyGraphHandler));
  app.get('/api/v1/investigations/:id/export', requireAuth, wrap(controller.exportInvestigationHandler));
}
