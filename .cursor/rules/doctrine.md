# Doctrine JustTrip — règles opérationnelles (agents & devs)

Référence complète : `docs/ARCHITECTURE.md`.

## Web / app — un seul codebase

- **Une** codebase React ; divergence via `Capacitor.isNativePlatform()` et responsive (`lg` ≈ 1024px), **jamais** par duplication de composant.
- **Web** : découverte généreuse (recherche, guide, génération essai).
- **Engagement** (sauvegarde voyage, planning persisté, rappels) → **invitation app élégante**, pas de mur ni écran vide.
- Composants **voyage** (TripMap, planning, sheets) = **mobile-first** ; pages **découverte** = web + app.

## Mobile-first — appliquer à chaque PR voyage

| Règle | Action concrète |
|-------|-------------------|
| Viewport **390×844** | Valider dans DevTools iPhone avant push |
| Desktop = **non-régression** | Pas d’optimisation desktop-first ; layout alternatif `lg+` seulement |
| **Bottom sheet 3 crans** | Replié ~72px / mi-hauteur (défaut) / plein ; drag + `prefers-reduced-motion` |
| **Safe areas** | `env(safe-area-inset-*)`, `--app-header-clearance`, `--app-bottom-nav-clearance` |
| Cibles **≥ 44px** | FAB, poignées, boutons flottants |
| **Un chunk carte** | `LazyTripMap` partout ; pas de second TripMap |
| **Sync date ↔ carte ↔ liste** | fitBounds jour, tap ballon ↔ scroll liste, sheet activité |
| **Carte toujours visible** | Fallback Nominatim si pas de coords ; jamais skeleton infini |

## Données

- Planning / carte : activités **persistées** Supabase (`buildPlannerMapActivities`), pas l’objet génération en mémoire.
- Sauvegarde calendrier : brancher `photo_url` / coords depuis l’itinéraire en mémoire, ne pas re-résoudre.

## Avant push (composants voyage)

1. DevTools **390px** — parcours planning + carte + sheet
2. `npm test` + `npm run build`
3. Desktop `lg` : smoke non-régression

## Hors scope (backlog)

SEO pré-rendu pages destination, offline tuiles, deep links — voir `docs/ARCHITECTURE.md` §5.
