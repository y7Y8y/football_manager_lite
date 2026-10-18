# Football Manager Lite

Jeu de gestion de football, sans aucun asset ni donnée réelle : monde, clubs,
joueurs et calendrier sont **générés** à partir d'une graine.

## État d'avancement

| Phase | Contenu | Critère | État |
|---|---|---|---|
| 0 — Cadrage | moteur web choisi, périmètre, schéma de données | dépôt qui démarre | fait |
| 1 — Données | générateur fictif, staff, calendrier aller-retour, sauvegarde | **afficher un club et son effectif** | fait |
| 2 — Simulation texte | match tick par tick, classement calculé | simuler une saison sans UI | fait |
| 3 — Interface | club, effectif, tactique, calendrier, classement, transferts | jouer une saison via l'UI | à faire |
| 4 — Match 2D | terrain, 22 points, ballon | comprendre un match en 2D | à faire |
| 5 — Match 3D | terrain 3D, personnages, caméra TV | 60 fps sur machine moyenne | à faire |
| 6 — Profondeur | transferts avancés, presse, academy, finances, FFP | systèmes P1 stables | à faire |

## Démarrer

```bash
npm install       # dépendances
npm run dev       # serveur de développement (http://localhost:5173)
npm test          # 101 tests
npm run build     # build de production dans dist/
```

## Ce que contient `src/`

```
src/
  data/       modèle de données, générateur déterministe, sauvegarde versionnée
    types.ts        sous-ensemble MVP du schéma (doc 25)
    names.ts        bassins de noms fictifs
    generate.ts     generateWorld({ seed }) -> monde complet
    save.ts         enveloppe versionnée, migrations, refus net
  core/       simulation, indépendante du rendu
    rng.ts          mulberry32 + splitmix32
    tick.ts         les 14 systèmes, dans l'ordre de la doc 48
    matchSim.ts     simulation d'un match, sans rendu
    squad.ts        sélection des 11 et évaluation de la force
    standings.ts    classement calculé depuis les matchs
    runtime.ts      pas de temps fixe 60 Hz
    pitch.ts        positions tactiques 2D
  ui/         écrans
    club.ts         Effectif : club + tableau des joueurs (phase 1)
    dashboard.ts    mesures du moteur (prototype FMT-1)
    matchView.ts    vue match 2D/3D
  match3d/    rendu 3D et repli 2D
```

## Règles de conception du monde

- **Déterministe** : une graine donne toujours le même monde. C'est ce qui rend
  les tests et les parties reproductibles.
- **Données fictives** : aucun nom, club ou chiffre réel. Aucun asset tiers.
- **Argent en entiers**, en centimes — jamais de flottant.
- **Attributs 0–100**, sauf capacité actuelle et potentiel (0–200).
- **Dates ISO 8601** (`YYYY-MM-DD`).
- **Le classement n'est jamais stocké** : il se calcule depuis les matchs.
- **Un tick = un jour.** 14 systèmes tournent dans un ordre fixe ; ceux qui ne
  sont pas encore implémentés sont marqués réservés et datés par jalon.
- **Le classement n'est jamais stocké** : `computeStandings` le recalcule
  depuis les matchs, à chaque fin de journée.

## Simulation de match

Le modèle simule à la **minute**, et chaque minute porte des phases de jeu.
Une phase = une attaque : progression par les passes, puis conclusion (tir,
arrêt, but, coup de pied arrêté, faute).

Pourquoi pas le tick spatial de la doc 48 : ce modèle est juste pour UN match
regardé, mais il n'explique pas lisiblement pourquoi une équipe faible perd
contre une équipe forte, et il coûte de l'ordre de 160 000 pas par match.
Pour 240 matchs de championnat, on ne peut pas se le permettre. La doc 42
recommande d'ailleurs « utility AI + state machine » pour un MVP.

Les statistiques se calculent **à partir des événements**, jamais en parallèle
(doc 40). Un événement est de la donnée pure, sans logique d'affichage
(doc 14).

### Ordres de grandeur mesurés

Sur une saison complète (240 matchs, 16 clubs), graine 20261017 :

| Mesure | Valeur | Référence championnat |
|---|---|---|
| Buts par match | 2,94 | 2,4 – 3,0 |
| Victoires à domicile | 47 % | ~46 % |
| Matchs nuls | 20 % | 18 – 30 % |
| Jaunes par match | 3,95 | ~4 |
| Rouges par match | 0,14 | ~0,1 |
| Blessures par match | 0,22 | ~0,2 |
| Temps de calcul | 0,34 s | budget doc 48 : 4 ms/match |

Ces chiffres ne sont pas une reproduction d'un championnat réel : ce sont des
garde-fous. Les tests de `season.test.ts` échouent si le modèle dérive hors de
ces bandes.

## Sauvegarde

Le format est versionné dès la phase 1 (« sauvegarde cassée » est un risque
nommé dans la feuille de route). Une sauvegarde porte `fmt`, `version`,
`savedAtTick` et le monde. Un format ou une version inconnus est **refusé**,
jamais deviné : `SaveFormatError` / `SaveVersionError`.

## Polices

Barlow (interface) et Barlow Condensed (données sportives), auto-hébergées dans
`public/fonts/`. Les deux sont sous SIL Open Font License 1.1 : usage commercial,
incorporation et hébergement autorisés sans frais. Aucun CDN, aucun appel réseau.

## Notes

- Le rendu 3D réel (WebGL2, FPS, mesures de pixels) ne peut pas être validé dans
  un environnement sans GPU : il se vérifie dans le navigateur.
- `three.js` pèse l'essentiel du bundle JavaScript ; le découpage viendra avec
  les écrans qui en ont besoin.
