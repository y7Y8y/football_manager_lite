import { defineConfig } from 'vite';

/**
 * Configuration Vite adaptée à l'aperçu Arena Agent Mode.
 *
 * Contraintes de l'environnement d'aperçu :
 *  - le serveur doit écouter sur 0.0.0.0 (sinon le proxy ne l'atteint pas) ;
 *  - le port doit être explicite et stable, car l'aperçu est publié par port ;
 *  - l'hôte public de l'aperçu est un sous-domaine d'un domaine que nous ne
 *    contrôlons pas, mais qui est celui de l'infrastructure d'aperçu.
 *
 * Décisions prises, et pourquoi :
 *
 *  1. `allowedHosts` reste une LISTE EXPLICITE. On n'utilise jamais
 *     `allowedHosts: true` : Vite documente que cela expose le serveur de dev
 *     à une attaque par DNS rebinding (GHSA-vg6x-rcgg-rjx6).
 *     Par défaut on autorise uniquement le domaine de l'infrastructure
 *     d'aperçu (`.e2b.app`), ce qui couvre n'importe quel sous-domaine de port
 *     sans ouvrir le serveur au monde entier. Des hôtes supplémentaires
 *     peuvent être ajoutés via FMT_EXTRA_ALLOWED_HOSTS (liste séparée par des
 *     virgules), par exemple pour un tunnel personnel.
 *
 *  2. `server.ws` : l'aperçu est servi en HTTPS derrière un proxy. Vite
 *     documente que, par défaut, un reverse proxy est censé relayer les
 *     WebSocket, et que si le client HMR échoue il tente une connexion
 *     DIRECTE au serveur HMR en contournant le proxy — ce qui échoue
 *     forcément derrière un proxy. On force donc le client à viser l'hôte
 *     public en `wss` sur le port 443. Mettre FMT_HMR_DIRECT=1 pour revenir
 *     au comportement par défaut (développement local en HTTP).
 *
 *  3. `strictPort` : si le port est pris, on échoue bruyamment au lieu de
 *     basculer silencieusement sur un autre port (ce qui casserait l'URL
 *     d'aperçu déjà affichée).
 */

const previewHosts = (process.env.FMT_EXTRA_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter((host) => host.length > 0);

// Domaine de l'infrastructure d'aperçu Arena. Le point initial autorise le
// domaine nu et tous ses sous-domaines, et rien d'autre.
const defaultPreviewHosts = ['.e2b.app'];

const allowedHosts = [...defaultPreviewHosts, ...previewHosts];

const hmrDirect = process.env.FMT_HMR_DIRECT === '1';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: Number(process.env.FMT_PORT ?? 5173),
    strictPort: true,
    allowedHosts,
    ...(hmrDirect ? {} : { ws: { protocol: 'wss', clientPort: 443 } }),
  },

  preview: {
    host: '0.0.0.0',
    port: Number(process.env.FMT_PREVIEW_PORT ?? 4173),
    strictPort: true,
  },

  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
  },
});
