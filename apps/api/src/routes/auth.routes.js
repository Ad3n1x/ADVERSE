import { sendPasswordResetEmail } from '../services/auth/password-reset-email.js';
import { createAuthController } from '../controllers/auth/auth.controller.js';
import { createPasswordResetController } from '../controllers/auth/password-reset.controller.js';

export function registerAuthRoutes(app, dependencies) {
  const {
    limitAuth, wrap, sendError, isDb, User, memory,
  } = dependencies;
  const auth = createAuthController(dependencies);
  const passwordReset = createPasswordResetController({ isDb, User, memory, sendError, sendPasswordResetEmail });

  app.post('/api/v1/auth/register', limitAuth, wrap(auth.register));
  app.post('/api/v1/auth/login', limitAuth, wrap(auth.login));
  app.post('/api/v1/auth/forgot-password', limitAuth, wrap(passwordReset.forgotPassword));
  app.post('/api/v1/auth/reset-password', limitAuth, wrap(passwordReset.resetPassword));
  app.get('/api/v1/auth/me', dependencies.requireAuth, wrap(auth.me));
  app.post('/api/v1/auth/logout', auth.logout);
  app.delete('/api/v1/auth/account', dependencies.requireAuth, wrap(auth.deleteAccount));
}
