# JustTrip — Architecture & doctrine

Document de référence pour l’équipe et les agents. Décrit la **cible produit**, les règles **mobile-first**, et le **backlog stratégique**.

> **Phasage (état actuel vs cible)**  
> **Maintenant** : le **web offre le produit complet** — sauvegarde, planning, calendrier, carte, compte : **aucune restriction**, **aucun gate** « installer l’app ».  
> **Après publication app sur les stores** (décision explicite) : les **invitations app** pourront remplacer certaines actions web (gates élégants sur sauvegarde / planning / rappels).  
> Ce document décrit la **cible** et le phasage futur — **ne pas implémenter de gates avant instruction explicite**.

---

## 1. Deux surfaces, un produit

| Surface | Rôle | Fonctions typiques |
|--------|------|-------------------|
| **justtrip.fr (web)** | Produit complet **aujourd’hui** ; porte SEO + découverte en plus | Landing, recherche, guides, génération, **sauvegarde, planning, calendrier, carte** |
| **App (Capacitor iOS/Android + PWA installée)** | Même produit + natif (rappels, offline cible) | Compte, voyages, planning, carte, notifications locales |

**Aujourd’hui** : web = produit complet, sans gate. **Cible post-stores** : le web reste généreux en découverte ; certaines actions d’engagement pourront afficher une invitation app élégante (jamais un mur) — voir §5.

## 2. Doctrine web / app

### 2.1 Un seul codebase

- **Une** base React/Vite/Supabase pour web et app native.
- La divergence se fait par **contexte** :
  - `Capacitor.isNativePlatform()` pour capacités natives (notifications, stockage, deep links…)
  - **Responsive** (`matchMedia`, breakpoint `lg` ≈ 1024px) pour layout
- **Interdit** : dupliquer un composant entier « version web » / « version app ». Préférer props (`mode`, `suppressActivitySheet`, `embedded`) et branches conditionnelles courtes.

### 2.2 Web et app — aujourd’hui vs cible

**État actuel (à maintenir)**

| Web + app (même codebase) |
|---------------------------|
| Sauvegarde voyage, planning, calendrier, carte, budget, compte — **tout accessible sur le web** |
| Aucun `AppInstallGate`, aucun blocage sauvegarde/planning |
| Rappels : natif si Capacitor ; sinon absent ou web selon implémentation existante |

**Cible (après publication stores — ne pas coder sans décision)**

| Web (justtrip.fr) | App native |
|-------------------|------------|
| Découverte généreuse inchangée | Produit complet + offline, rappels optimaux |
| Gates **optionnels** sur sauvegarde / planning → invitation app | Expérience de référence |
| SEO landing / pages ville (backlog) | Deep links voyage |

**Pattern invitation app (cible future)** : sheet ou modal avec bénéfices (rappels, offline…), CTA store, possibilité de continuer sur le web — **jamais un paywall ni une 404**. Interdit de l’implémenter tant que l’app n’est pas publiée et que la décision produit n’est pas actée.

### 2.3 Priorité de conception par zone

| Zone | Priorité design | Desktop |
|------|-----------------|---------|
| TripMap, planning, bottom sheets, rappels | **App mobile d’abord** | Non-régression uniquement |
| Guide destination, recherche, landing | Web **et** app | Layout adapté des deux côtés |
| Budget, logement, partage | Produit complet | Grille desktop acceptable |

Les composants **voyage** (`LazyTripMap`, `PlannerBottomSheet`, `TripMapActivitySheet`, cartes activité planning) se conçoivent pour le viewport canonique **390×844** ; le desktop reçoit un layout alternatif (ex. carte sticky 320px sous le calendrier) sans refonte fonctionnelle.

### 2.4 Données et persistance

- **Modale post-génération** : objet itinéraire en mémoire (photos, meta enrichissement).
- **Planning / carte** : activités du **voyage actif** lues depuis **Supabase** (`latitude`, `longitude`, `photo_url`, etc.).
- Ne pas re-résoudre en base ce qui est déjà connu en mémoire au moment de « Ajouter au calendrier ».

---

## 3. Doctrine mobile (8 règles)

1. **Viewport canonique 390×844** — design, QA et validation DevTools iPhone SE/14 avant tout push touchant le voyage (planning, carte, sheets).

2. **Mobile-first, desktop en non-régression** — implémenter et valider le parcours mobile ; le desktop (`lg+`) ne reçoit pas d’optimisations spécifiques sauf layout alternatif documenté.

3. **Bottom sheet 3 crans** (pattern canonique overlays voyage) :
   - **Replié** (~72px) : poignée + résumé (date, compteur)
   - **Mi-hauteur** (défaut à l’ouverture) : calendrier compact + liste du jour, carte visible au-dessus
   - **Plein** : liste + calendrier complets, carte masquée  
   Gestes : drag poignée, momentum, `prefers-reduced-motion` → snap instantané.

4. **Safe areas obligatoires** — `env(safe-area-inset-top|bottom)`, variables CSS `--app-header-clearance`, `--app-bottom-nav-clearance` ; jamais de contenu ni FAB sous la bottom bar ou l’encoche.

5. **Cibles tactiles ≥ 44px** — FAB, boutons primaires flottants, poignées de sheet ; espacement suffisant entre actions adjacentes.

6. **Un composant, un chunk** — ex. `LazyTripMap` partagé (modale itinéraire + planning) ; pas de second bundle carte dupliqué.

7. **Synchronisation calendrier ↔ carte ↔ liste** — sélection date → ballons du jour + fitBounds ; tap ballon ↔ scroll liste ↔ sheet activité ; « Voir tout le voyage » → vue trip (cercles-jours).

8. **Carte jamais absente** — jour sans coords : centrage destination (Nominatim cache) + note discrète ; pas de skeleton infini ni de carte masquée par défaut.

---

## 4. Tableau des zones

| Zone | Code / composants | Surface | Mobile-first | Web (aujourd’hui) |
|------|-------------------|---------|--------------|-------------------|
| Landing / accueil | `App.jsx` home | Web + app | Non | Complet |
| Recherche destination | `DestinationSearch*` | Web + app | Non | Complet |
| Guide destination | `DestinationGuideView`, must-see | Web + app | Non | Complet |
| Modale itinéraire généré | `ItineraryResultModal`, `LazyTripMap` | Web + app | Oui (carte) | Complet |
| Ajouter au calendrier | `createTrip`, `insertActivities*` | Web + app | — | **Complet (pas de gate)** |
| Planning / calendrier | `PlannerView`, `PlannerBottomSheet` | Web + app | **Oui** | **Complet (pas de gate)** |
| Carte planning | `LazyTripMap`, `buildPlannerMapActivities` | Web + app | **Oui** | Complet |
| Sheet activité carte | `TripMapActivitySheet` | Web + app | **Oui** | Complet |
| Mes voyages | `TripCard`, listes | Web + app | Moyen | Complet |
| Rappels | `activityReminders.js`, Capacitor | App native (+ web si dispo) | Oui | Selon plateforme |
| Budget / logement | `Budget*`, `StaysView` | Web + app | Non | Complet |

---

## 5. Backlog stratégique (hors scope courant)

À traiter **après décision produit** ou **pré-lancement marketing** — pas sur `main` sans instruction explicite :

| Item | Quand | Objectif | Piste technique |
|------|-------|----------|-----------------|
| **Gates invitation app** | **Après publication stores uniquement** | Inviter (sans bloquer brutalement) vers l’app sur sauvegarde / planning | `AppInstallSheet` + flag produit ; **interdit avant go stores** |
| **SEO pages destination** | Pré-lancement marketing | Indexabilité Google des URLs ville | Pré-rendu statique, SSR partiel (Vercel/edge) |
| **Offline app** | Post-MVP app | Voyage + tuiles carte sans réseau | Service Worker + cache MapLibre + sync différée |
| **Deep links web → app** | Avec app en store | Ouvrir un voyage partagé dans l’app native | Universal Links / App Links |

---

## 6. Stack & conventions techniques

- **Frontend** : React 18, Vite, Tailwind, MapLibre GL (chunk lazy `TripMap`)
- **Backend** : Supabase (auth, trips, activities), API routes Vercel (`api/planner/*`)
- **Native** : Capacitor (iOS/Android)
- **i18n** : `i18n/translations.js` — toute copy utilisateur via clés `t()`
- **Migrations SQL** : `supabase/sql/*.sql` — à appliquer manuellement dans Supabase SQL Editor

---

## 7. Validation avant merge

Pour toute PR touchant **planning, carte, sheets, rappels** :

1. DevTools → iPhone, **390px** de large
2. Parcours : voyage actif → carte plein écran → sheet 3 crans → sync date/ballon/liste
3. Safe areas (FAB, bottom bar)
4. Desktop `lg` : non-régression calendrier + carte sticky
5. `npm test` + `npm run build`

---

*Dernière mise à jour : phasage gates (web complet jusqu’à publication stores).*
