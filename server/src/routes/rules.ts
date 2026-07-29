import { Router } from 'express';
import { loadRules, resetRules, saveRules } from '../storage/rules.js';
import type { AttendanceConfig } from '../types.js';

export const rulesRouter = Router();

rulesRouter.get('/', async (_request, response, next) => {
  try {
    response.json(await loadRules());
  } catch (error) {
    next(error);
  }
});

rulesRouter.put('/', async (request, response, next) => {
  try {
    response.json(await saveRules(request.body as AttendanceConfig));
  } catch (error) {
    next(error);
  }
});

rulesRouter.delete('/', async (_request, response, next) => {
  try {
    response.json(await resetRules());
  } catch (error) {
    next(error);
  }
});
