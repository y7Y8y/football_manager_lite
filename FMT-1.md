# FMT-1 — Rapport de faisabilité de l'aperçu web

**Dépôt :** `y7Y8y/football_manager_lite`
**Branche :** `arena/977e2376-football-manager-lite` ( `main` non touché )
**Date :** 17 octobre 2026
**Objet :** vérifier que TypeScript + Vite + Three.js permettent d'observer l'évolution du jeu dans l'aperçu intégré d'Arena Agent Mode.

---

## 1. Périmètre

Prototype technique **uniquement**. Ne contient ni effectifs, ni tactiques, ni transferts, ni finances, ni championnat, ni sauvegarde. Il est prévu pour être supprimé ou remplacé sans perte si les tests échouent.

---

## 2. Fichiers créés

| Fichier | Rôle |
|---|---|
| `.gitignore` | exclut `node_modules/`, `dist/`, caches |
| `package.json` | dépendances : `three` ; dev : `vite`, `typescript`, `vitest`, `@types/*`, `jsdom` |
| `package-lock.json` | versions figées |
| `tsconfig.json` | TS strict, `noEmit`, cible ES2022 |
| `vite.config.ts` | adaptation à l'aperçu Arena (host, port, hôtes autorisés, WebSocket HMR) |
| `index.html` | coquille HTML + point d'entrée module |
| `src/main.ts` | amorçage, navigation entre les deux vues |
| `src/styles.css` | thème sombre |
| `src/app/metrics.ts` | store de mesures partagé (FPS, GPU, ticks…) |
| `src/core/rng.ts` | générateur déterministe (mulberry32) |
| `src/core/pitch.ts` | cotes du terrain + formation 4-3-3 |
| `src/core/simulation.ts` | 22 joueurs + ballon, pas de temps déterministe |
| `src/core/runtime.ts` | pilotage du moteur, sans aucune notion de rendu |
| `src/core/simulation.test.ts` | 9 tests : déterminisme, bornes, mouvement |
| `src/core/pitch.test.ts` | 5 tests : cotes, formation, couleurs |
| `src/ui/dom.ts` | aides DOM minimales |
| `src/ui/dashboard.ts` | écran tableau de bord |
| `src/ui/matchView.ts` | écran match + HUD de mesure |
| `src/ui/app.smoke.test.ts` | 2 tests de démarrage (jsdom) |
| `src/match3d/detect.ts` | sonde WebGL2 + vendor/renderer |
| `src/match3d/scene.ts` | terrain, lignes, buts, lumières, caméras |
| `src/match3d/renderer.ts` | boucle Three.js, FPS, ombres, vues |
| `src/match3d/fallback.ts` | vue tactique 2D de repli |
| `FMT-1.md` | ce rapport |

**Aucun fichier préexistant modifié.** `README.md` est intact.

---

## 3. Commandes exécutées et durées mesurées

| Commande | Durée mesurée | Cible | Statut |
|---|---|---|---|
| `npm install --no-audit --no-fund` | **9,1 s** | < 180 s | réussi |
| `npx tsc --noEmit` | **2,26 s** | — | réussi (0 erreur) |
| `npx vitest run` (16 tests, 3 fichiers) | **1,84 s** | simulation < 10 s | réussi |
| dont 90 min de match simulées | **338 ms** | < 10 s | réussi |
| `npm run build` (`tsc` + `vite build`) | **2,54 s** | < 90 s | réussi |
| `vite build` seul | **232 ms** | — | réussi |
| `npm run dev` → serveur qui écoute | **1,03 s** (Vite « ready in 146 ms ») | < 60 s | réussi |

Build de production : **576 Ko** au total, **146 Ko** gzip (dont Three.js).

---

## 4. Tests réellement effectués

| # | Test | Résultat observé | Méthode de vérification | Statut |
|---|---|---|---|---|
| 1 | Branche de travail, pas `main` | `arena/977e2376-football-manager-lite`, arbre propre, `README.md` seul | `git rev-parse`, `git status`, `git ls-files` | réussi |
| 2 | Page d'entrée servie | HTTP 200, 540 o, titre correct, `/@vite/client` et `/src/main.ts` injectés | `curl` sur `http://127.0.0.1:5173/` | réussi |
| 3 | Graphe de modules complet | **14 modules sur 14 en HTTP 200**, 0 erreur de transformation | `curl` sur chaque module + `grep` d'erreurs | réussi |
| 4 | Dépendance Three.js résolue | imports réécrits vers les dépôts pré-bundularisés ; `three` (1,9 Mo) et `OrbitControls` (122 Ko) servis en HTTP 200 | inspection du module transformé + `curl` | réussi |
| 5 | Typage strict | 0 erreur | `tsc --noEmit` | réussi |
| 6 | Simulation déterministe | même graine → empreinte identique ; graines différentes → trajectoires différentes | 9 tests Vitest | réussi |
| 7 | 90 min de simulation en Node | 338 ms, minute 90, reproductible | test Vitest | réussi |
| 8 | Démarrage de l'application | barre de navigation (2 boutons), tableau de bord (4 cartes), valeurs issues du store de mesures | test de fumée jsdom | réussi |
| 9 | Bascule vers la vue match | vue match montée, canvas présent, HUD 4 valeurs, barre d'outils 4 boutons, retour au tableau de bord fonctionnel | test de fumée jsdom | réussi |
| 10 | Repli sans WebGL2 | classe `view-fallback` appliquée, message de repli affiché (jsdom n'a pas de WebGL2) | test de fumée jsdom | réussi |
| 11 | HMR — propagation | **16 ms** entre l'écriture du fichier et le module servi à jour ; log Vite : `(client) page reload src/ui/dashboard.ts` | horodatage `date +%s%N` + polling `curl` | réussi (côté serveur) |
| 12 | Comportement après erreur | module cassé → **HTTP 500** + message de parse précis ; serveur toujours vivant (`GET /` → 200) ; retour à la normale après correction (HTTP 200) | injection d'une erreur de syntaxe volontaire puis restauration | réussi |
| 13 | Filtrage des hôtes (dev et preview) | `127.0.0.1`, `localhost`, `*.e2b.app` → **200** ; `exemple.com`, `evil-e2b.app.attacker.com` → **403** | `curl -H "Host: …"` | réussi |
| 14 | Build de production servi | `vite preview` : `GET /` → 200, asset JS → 200, même filtrage d'hôtes | `vite preview` + `curl` | réussi |
| 15 | Rendu WebGL2 réel | **non mesurable** : aucun navigateur, aucun GPU (`/dev/dri` absent), Chrome for Testing non téléchargeable dans ce sandbox | inventaire du sandbox | **non vérifiable** |
| 16 | FPS à 22 joueurs sur le PC cible | **non mesurable ici** — voir § 6 | — | **non vérifiable** |
| 17 | HMR de bout en bout via le proxy d'aperçu | propagation serveur prouvée (16 ms) ; l'application dans le navigateur n'a pas pu être observée | — | **non vérifiable** |

---

## 5. Comment accéder à l'aperçu

Le serveur de développement tourne en continu dans cette session :

- **Processus :** `football_manager_lite — prototype FMT-1`
- **Port :** `5173`, lié sur `0.0.0.0`
- **URL d'aperçu Arena :** panneau *Live Preview* de la session (proxy `https://5173-<sandbox>.e2b.app`)
- **Équivalent local sur ton PC :** `npm install` puis `npm run dev`, puis `http://localhost:5173/`

---

## 6. À mesurer sur ton PC (impossible dans le sandbox)

Le HUD de la vue match affiche en direct : **FPS**, **appels de dessin**, **triangles**, **résolution**.

Procédure (2 minutes) :

1. Ouvre l'aperçu, clique sur **« Match »** dans la barre de navigation.
2. Attends 30 secondes sans rien toucher.
3. Lis la valeur **FPS** dans le HUD.
4. Note aussi **Appels de dessin** (attendu : une quinzaine) et **Triangles**.
5. Clique sur **« Ombres : désactivées »**, attends 10 secondes, relis les FPS.
6. Teste les deux caméras : **« Vue large »** et **« Vue tactique »**.
7. Ouvre la console du navigateur (F12) : la ligne `[FMT-1] moteur prêt` doit apparaître, sans erreur rouge.

Règle de décision : **≥ 30 FPS à 1280 × 720 avec 22 joueurs** → critère validé. Si < 30 FPS, désactive les ombres puis reconstate ; si c'est encore insuffisant, la vue tactique 2D de repli reste utilisable.

---

## 7. Problèmes rencontrés et solutions

| Problème | Solution |
|---|---|
| `el()` acceptait `id` sans l'appliquer : `#view-dashboard` et `#view-match` n'existaient pas | Bug **trouvé par le test de fumée**, corrigé dans `src/ui/dom.ts` |
| `OrbitControls` sans élément DOM : aucune interaction souris | Le canvas est passé à `createPitchScene()` |
| Aucun navigateur ni GPU dans le sandbox | Sonde WebGL2 sur un canvas jetable + vue 2D de repli + HUD lisible par l'utilisateur + tests jsdom |
| Taille du paquet `three` en développement (1,9 Mo) | Normal en dev ; le build de production ne pèse que 576 Ko / 146 Ko gzip |
| Filtrage d'hôtes de `vite preview` initialement non configuré | Vérifié empiriquement : `preview` applique bien la même liste `allowedHosts` |

---

## 8. Limites techniques restantes

- **Le rendu 3D n'a jamais été exécuté.** Tout ce qui concerne WebGL2, les ombres, la caméra et les FPS reste à valider dans ton navigateur.
- **Le HMR n'est prouvé que côté serveur** (16 ms). Si le proxy d'aperçu ne relaie pas les WebSocket, le client basculera sur un rechargement complet automatique — le critère < 3 s après rechargement reste applicable.
- Le prototype n'a **pas** de logique footballistique : déplacements et passes arbitraires, par conception.
- Aucune persistance : recharger la page repart de la graine `20261017`.

---

## 9. Conclusion

**GO** sur les critères mesurables dans le sandbox : **14 tests sur 14 réussis**, dont les 4 critères quantifiés de la mission (démarrage < 60 s, propagation < 5 s, build < 90 s, simulation < 10 s).

**GO conditionnel** sur le critère final : les FPS à 22 joueurs ne peuvent pas être mesurés ici. Le HUD est en place pour que tu les mesures en 2 minutes (§ 6). Tant que cette mesure n'est pas faite, le verdict complet reste suspendu — et ce n'est pas un détail de forme : c'est le seul critère que je ne peux pas honorer à ta place.
