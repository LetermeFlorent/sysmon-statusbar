# Spec: System Monitor Status Bar

Extension VS Code affichant en continu, dans la barre d'etat, la charge CPU, la
charge GPU et l'occupation memoire de la machine, sous la meme forme visuelle que
`claude-ratelimit-statusbar` du meme auteur : un libelle, une barre coloree en
glyphes de police, une valeur chiffree.

## Ce qui est affiche

Trois groupes de trois items chacun, dans cet ordre de gauche a droite :

```
CPU ▓▓▓░░░░░ 34%   GPU ▓░░░░░░░ 12%   RAM ▓▓▓░░░░░ 12.35 / 31.74 GB
```

- CPU : pourcentage d'utilisation de l'ensemble des coeurs logiques, entier.
- GPU : pourcentage d'utilisation des moteurs 3D, entier.
- RAM : memoire systeme utilisee et memoire systeme totale, en GB, deux
  decimales chacune, separateur decimal le point.

La barre fait 8 cellules par defaut, reglable de 4 a 20.

## Sources des mesures

Decision prise apres mesure sur le poste cible (AMD Radeon integre, pas de
`nvidia-smi`), critere retenu : la sonde doit peser le moins possible sur les
trois ressources qu'elle mesure.

CPU et RAM viennent de `node:os`, donc aucun process externe et aucun cout
mesurable. Le CPU se calcule par difference des compteurs cumules de `os.cpus()`
entre deux tics ; la RAM par `os.totalmem()` et `os.freemem()`.

Le GPU vient de `typeperf`, binaire natif de Windows, lance une seule fois en
flux continu sur le compteur `\GPU Engine(*engtype_3D)\Utilization Percentage`.
Les trois candidats mesures :

| Approche | RAM residente | CPU consomme | Latence par tic |
|---|---|---|---|
| `typeperf` en flux | 12,1 MB | 0,42 s sur 6 s de vie, demarrage inclus | nulle, flux pousse |
| daemon PowerShell `Get-Counter` | 76 a 91 MB | 2,05 s sur 12 s de vie | nulle, flux pousse |
| spawn `Get-Counter` par tic | nulle | ~2,8 s de mur par tic | 2,8 s |

`typeperf` gagne sur les trois criteres. Le spawn par tic est disqualifie : il
coute plus cher que ce qu'il mesure.

Limite connue de `typeperf` : le jeu d'instances du compteur est fige au
demarrage du process. Un programme qui commence a utiliser le GPU apres le
lancement n'apparait pas. Le daemon est donc recycle toutes les 300 secondes.

## Position dans la barre

Reglage `sysmon.alignment`, valeurs `left` et `right`, defaut `right`. Le
changement s'applique sans rechargement de la fenetre : les items sont detruits
et recrees.

## Palette

Identique a `claude-ratelimit-statusbar`, pour que les deux extensions se lisent
comme un seul bandeau : vert `#57c85a` sous 50 %, jaune `#e5c452` a partir de
50 %, orange `#e59b45` a partir de 75 %, rouge `#f14c4c` a partir de 90 %, gris
`#8a8a8a` quand la mesure est indisponible ou perimee.

Ce sont des hex en dur, donc identiques en theme clair et sombre. C'est un choix
assume de coherence avec l'extension soeur, pas un oubli.

## Etats degrades

- `typeperf` introuvable ou qui sort en erreur : le groupe GPU se grise et
  affiche `n/a`, CPU et RAM continuent normalement.
- Aucun echantillon GPU depuis plus de 30 secondes : le groupe GPU se grise, la
  derniere valeur connue reste affichee.
- Premier tic apres activation : le CPU n'a pas encore de delta, il affiche
  `--` pendant un tic.

## Contraintes

- JavaScript CommonJS, aucune dependance npm, aucune etape de build. Le repo se
  package tel quel avec `vsce package`, comme les deux extensions soeurs.
- Cible `engines.vscode` `^1.75.0`, `extensionKind` `ui`.
- Windows uniquement pour le GPU. CPU et RAM restent corrects ailleurs.
- Tests avec le lanceur `node:test` integre a Node, donc aucun `node_modules`.
- Aucun emoji, aucun accent dans les chaines affichees dans la barre d'etat
  ni dans les descriptions de `package.json`, pour rester aligne sur les deux
  extensions soeurs qui evitent les problemes d'encodage sous Windows.
