---
description: Doctrine produit — fix de classe, pas de pansement d'instance ; recettes hors catalogue
alwaysApply: true
---

# Doctrine — fix de classe, jamais d'instance

## Interdiction du fix d'instance

Quand un bug est constaté sur **une** destination, entité ou exemple (image héro, POI, conseil, donnée, section guide…), le correctif doit traiter **toute la classe** — toutes les destinations concernées par le même mécanisme — et **jamais** seulement l'exemple signalé.

| Exemple constaté | Mauvais fix | Bon fix |
|------------------|-------------|---------|
| Héro Crète = satellite | Forcer l'URL Crète | Règles qualité héro + tests WC/satellite/Elounda |
| Conseil « métro » sur île | Override tips Crète | Profil transport par type de destination |
| POI absurde sur une ville | Liste manuelle pour cette ville | Filtres + cascade de repli pour tout le guide |

## Overrides manuels

Les overrides par destination (`hero_overrides`, `set-hero.mjs`, listes emblématiques ponctuelles, etc.) sont un **outil de correction d'urgence** pour un cas en prod — **pas** la réponse à un bug systémique.

- Bug systémique → règle, cache, résilience, test anti-régression couvrant la classe.
- Override → après le fix de classe, pour un cas résiduel validé visuellement ; documenté comme exception, pas comme solution.

## Recettes de validation

Toute recette de fix **guide / images / données** doit inclure **au moins 3 destinations hors catalogue**, choisies par l'utilisateur — **jamais** uniquement la destination du bug rapporté.

La destination du bug peut servir de **reproduction** du problème initial, pas de preuve suffisante que le fix de classe tient.

## Pansement vs fix — transparence obligatoire

Si un fix de classe est **impossible dans le temps imparti**, l'indiquer explicitement :

> *« Ceci est un pansement d'instance ; le fix de classe reste ouvert. »*

Ne **jamais** présenter un pansement (override, hardcode, exception nommée) comme si c'était le fix définitif.

## Checklist avant de livrer

1. Le changement s'applique-t-il à **toute la classe** (pas seulement l'exemple) ?
2. Y a-t-il une **règle / config centralisée** + **test ou recette** anti-régression ?
3. La recette couvre-t-elle **≥ 3 destinations hors catalogue** (fournies par l'utilisateur) ?
4. S'agit-il d'un override ? → documenté comme **urgence**, pas comme architecture.
