import express, { Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pinoHttp from "pino-http";
import router from "./routes";
import ridesRouter from "./routes/rides";
import { logger } from "./lib/logger";

const app: Express = express();

// --- WEBSEITEN-DIREKT-VERSAND ---
app.get('/', (req, res, next) => {
  const host = req.get('host');
  if (host === 'onroda.de' || host === 'www.onroda.de') {
    // ACHTUNG: Hier jetzt 'static' statt 'dist/public'
    const filePath = path.join(process.cwd(), 'static', 'index.html');
    return res.sendFile(filePath);
  }
  next();
});
// --- WEBSEITEN-DIREKT-VERSAND ENDE ---

// ... hier geht der restliche Code weiter (pinoHttp, etc.)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- DER INTELLIGENTE TÜRSTEHER ---
app.use((req, res, next) => {
  const host = req.get('host');
  
  if (host === 'api.onroda.de') {
    return next();
  }

  // Wir erzwingen den Pfad ausgehend vom Hauptverzeichnis
  const publicPath = path.join(process.cwd(), 'dist', 'public');
  
  // Dieser Log zeigt uns in PM2 genau, was passiert
  console.log(`Anfrage für ${host} - Suche in: ${publicPath}`);

  express.static(publicPath)(req, res, next);
});
// --- DER INTELLIGENTE TÜRSTEHER ENDE ---

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use(ridesRouter);

export default app;
