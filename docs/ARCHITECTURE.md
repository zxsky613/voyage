# JustTrip — Architecture & doctrine

Document de référence pour l’équipe et les agents. Décrit la répartition **web public** / **app produit**, les règles **mobile-first**, et le **backlog stratégique**.

---

## 1. Deux surfaces, un produit

| Surface | Rôle | Fonctions typiques |
|--------|------|-------------------|
| **justtrip.fr (web)** | Porte d’entrée fonctionnelle, découverte, SEO | Landing, recherche destination, guides, génération d’essai, contenus marketing |
| **App (Capacitor iOS/Android + PWA installée)** | Produit complet | Compte, voyages sauvegardés, planning/calendrier, carte interactive, rappels locaux, offline (cible) |

Le web doit rester **généreux** sur la découverte. Les fonctions d’**engagement** (persistance, planning, notifications) orientent vers l’app via une **invitation élégante** — jamais un mur, une 404 ou un écran vide.

---

## 2. Doctrine web / app

### 2.1 Un seul codebase

- **Une** base React/Vite/Supabase pour web et app native.
- La divergence se fait par **contexte** :
  - `Capacitor.isNativePlatform()` pour capacités natives (notifications, stockage, deep links…)
  - **Responsive** (`matchMedia`, breakpoint `lg` ≈ 1024px) pour layout
- **Interdit** : dupliquer un composant entier « version web » / « version app ». Préférer props (`mode`, `suppressActivitySheet`, `embedded`) et branches conditionnelles courtes.

### 2.2 Web = découverte ; app = engagement

| Web (justtrip.fr) | App |
|-------------------|-----|
| Recherche, guide destination, lieux incontournables | Voyages sauvegardés en base |
| Génération d’itinéraire d’essai (modale) | « Ajouter au calendrier » persisté |
| Hero, météo, cartes situation légères | Planning jour par jour + carte sync |
| SEO landing / pages ville (backlog) | Rappels activité (Capacitor Local Notifications) |
| Invitation à installer / ouvrir l’app | Mode offline (backlog) |

**Pattern invitation app** : sheet ou modal avec bénéfices clairs (sauvegarder, rappels, carte offline), CTA store / ouvrir l’app, possibilité de continuer la découverte sans bloquer.

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

| Zone | Code / composants | Surface | Mobile-first | Web sans compte |
|------|-------------------|---------|--------------|-----------------|
| Landing / accueil | `App.jsx` home | Web + app | Non | Oui |
| Recherche destination | `DestinationSearch*` | Web + app | Non | Oui |
| Guide destination | `DestinationGuideView`, must-see | Web + app | Non | Oui (essai) |
| Modale itinéraire généré | `ItineraryResultModal`, `LazyTripMap` | Web + app | Oui (carte) | Génération essai |
| Ajouter au calendrier | `createTrip`, `insertActivities*` | App (+ invitation web) | — | Invitation app |
| Planning / calendrier | `PlannerView`, `PlannerBottomSheet` | App | **Oui** | Invitation app |
| Carte planning | `LazyTripMap`, `buildPlannerMapActivities` | App | **Oui** | — |
| Sheet activité carte | `TripMapActivitySheet` | App | **Oui** | — |
| Mes voyages | `TripCard`, listes | App | Moyen | Invitation app |
| Rappels | `activityReminders.js`, Capacitor | App native | Oui | — |
| Budget / logement | `Budget*`, `StaysView` | App | Non | Partiel |

---

## 5. Backlog stratégique (hors scope courant)

À traiter **pré-lancement marketing**, pas sur `main` en développement feature courant :

| Item | Objectif | Piste technique |
|------|----------|-----------------|
| **SEO pages destination** | Indexabilité Google des URLs ville (ex. `/destination/cassis`) | Pré-rendu statique, SSR partiel (Vercel/edge), ou snapshot HTML par ville |
| **Offline app** | Consultation voyage + carte tuiles en cache sans réseau | Service Worker + cache tuiles MapLibre + sync Supabase différée |
| **Deep links web → app** | Ouvrir un voyage partagé dans l’app native | Universal Links / App Links + route `/trip/:id` |
| **Invitation app unifiée** | Composant réutilisable CTA store | `AppInstallSheet` branché sur sauvegarde / planning / rappels |

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

*Dernière mise à jour : doctrine formalisée avec `feature/planning-map`.*
