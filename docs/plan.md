# Plan 0.9.0

Objectif : une extension qui tient la comparaison avec ce qui se publie de mieux sur le Marketplace, sans changer ce qui marche déjà.

## Périmètre retenu

Florent a validé cinq chantiers le 25 septembre 2026, plus un ajout.

1. Une seule langue par écran. Titres de commandes, réglages et textes d'interface en anglais par défaut, traduits en français avec les accents via `package.nls.fr.json` et `l10n/bundle.l10n.fr.json`.
2. Découpage du code : aucun fichier au-dessus de 150 lignes, une responsabilité par fichier, sources rangées sous `src/`.
3. Catégorie `Visualization` et mots-clés utiles au Marketplace.
4. CI GitHub Actions sur Windows, Linux et macOS, et publication par tag avec `vsce`.
5. Accessibilité : `accessibilityInformation` et un identifiant par élément de barre d'état, pour les lecteurs d'écran et le menu contextuel de VS Code.
6. Mémoire libre et swap sur les trois systèmes.

Le chien de garde de la sonde et la mesure GPU hors moteurs 3D ont été écartés.

## Sources pour la swap

Sous Windows, le compteur `Paging File(_Total)\% Usage` rejoint le `typeperf` déjà ouvert. Sur un Windows français il n'est accepté que sous son nom exact, `Fichier d’échange(_Total)\Pourcentage d’utilisation`, apostrophe typographique comprise. La taille allouée vient de `Win32_PageFileUsage`, lue une fois au démarrage de la sonde.

Sous Linux, `/proc/meminfo` donne `SwapTotal`, `SwapFree` et `MemAvailable`. Ce dernier remplace `os.freemem()`, qui ignore le cache et gonfle la mémoire utilisée.

Sous macOS, `sysctl -n vm.swapusage`.

## Version

0.9.0, entrée de changelog en anglais comme les précédentes.
