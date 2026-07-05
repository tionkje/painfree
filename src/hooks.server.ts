// Importing these at server startup validates env (zod) and runs migrations +
// seed before the first request lands.
import './lib/server/env';
import './lib/server/db';
import { logger } from './lib/server/logger';

logger.info('painfree started');
