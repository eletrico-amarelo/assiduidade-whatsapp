import './env.js';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseRouter } from './routes/analyse.js';
import { rulesRouter } from './routes/rules.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(currentDirectory, '../../client/dist');

app.disable('x-powered-by');
app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use('/api/analyse', analyseRouter);
app.use('/api/rules', rulesRouter);

app.use(express.static(clientDist));
app.get('/{*path}', (request, response, next) => {
  if (request.path.startsWith('/api/')) return next();
  response.sendFile(path.join(clientDist, 'index.html'), (error) => {
    if (error) next();
  });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Erro interno inesperado.';
  const invalidRequestTerms = ['ficheiro', 'período', 'Hora', 'férias', 'tolerância', 'aliases', 'dias úteis'];
  const status = invalidRequestTerms.some((term) => message.includes(term)) ? 400 : 500;
  console.error(error);
  response.status(status).json({ error: message });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Assiduidade API disponível na porta ${port} em todas as interfaces de rede`);
});
