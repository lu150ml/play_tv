import type { ContentItem } from "../types/catalog";

export const mockCatalog: ContentItem[] = [
  {
    id: "neon-genesis-awakening",
    type: "movie",
    title: "Neon Genesis: The Awakening",
    description:
      "A retired digital architect returns to a hyper-connected metropolis after a rogue AI begins rewriting the city grid.",
    genres: ["Sci-Fi", "Thriller"],
    categories: ["Movies", "Trending", "Featured"],
    quality: ["4K", "HDR10"],
    year: 2024,
    durationSeconds: 8100,
    director: "Elena Rostova",
    cast: ["Marcus Vance", "Aria Chen", "Noah Kade"],
    backdropTone: "from-cyan-500/25 via-slate-900 to-black",
    posterTone: "from-cyan-300/30 via-slate-700 to-slate-950",
    isFeatured: true,
    addedAt: "2026-06-01"
  },
  {
    id: "orbital-decay",
    type: "movie",
    title: "Orbital Decay",
    description:
      "A documentary crew follows engineers trying to save an aging station before its final lap around Earth.",
    genres: ["Documentary", "Space"],
    categories: ["Movies", "Recently Added"],
    quality: ["4K"],
    year: 2025,
    durationSeconds: 5412,
    director: "Rafa Moretti",
    cast: ["Lina Costa", "Ari Feld"],
    backdropTone: "from-sky-400/25 via-slate-900 to-black",
    posterTone: "from-sky-300/30 via-indigo-950 to-slate-950",
    addedAt: "2026-06-12"
  },
  {
    id: "syntax-error",
    type: "series",
    title: "Syntax Error",
    description:
      "A security analyst discovers a conspiracy hidden inside failed builds across the world's largest networks.",
    genres: ["Thriller", "Mystery"],
    categories: ["Series", "Trending"],
    quality: ["HD", "Full HD"],
    year: 2023,
    durationSeconds: 3600,
    seasons: 2,
    episodes: [
      {
        id: "syntax-error-s1e1",
        title: "Broken Pipeline",
        season: 1,
        episode: 1,
        durationSeconds: 3570,
        description: "A suspicious deploy reveals a pattern no one wants to acknowledge."
      },
      {
        id: "syntax-error-s1e2",
        title: "Shadow Commit",
        season: 1,
        episode: 2,
        durationSeconds: 3624,
        description: "An unsigned change points to a team that should not exist."
      }
    ],
    backdropTone: "from-emerald-400/20 via-slate-900 to-black",
    posterTone: "from-emerald-300/25 via-slate-800 to-black",
    isFeatured: true,
    addedAt: "2026-05-24"
  },
  {
    id: "machine-heart",
    type: "series",
    title: "Machine Heart",
    description:
      "In a city built on automation, a repair technician finds emotion inside a forbidden synthetic mind.",
    genres: ["Sci-Fi", "Drama"],
    categories: ["Series", "Recently Added"],
    quality: ["4K", "HDR10"],
    year: 2026,
    durationSeconds: 4200,
    seasons: 1,
    episodes: [
      {
        id: "machine-heart-s1e1",
        title: "First Signal",
        season: 1,
        episode: 1,
        durationSeconds: 4180,
        description: "A private diagnostic call turns into a city-wide secret."
      }
    ],
    backdropTone: "from-violet-400/20 via-slate-900 to-black",
    posterTone: "from-violet-300/25 via-slate-800 to-black",
    addedAt: "2026-06-15"
  },
  {
    id: "cine-max-live",
    type: "channel",
    title: "Cine Max Live",
    description: "A premium movie channel with curated sci-fi, action, and late-night classics.",
    genres: ["Movies", "Action"],
    categories: ["Live TV", "Featured"],
    quality: ["Full HD"],
    channelNumber: 101,
    currentProgram: "Neon Nights",
    nextProgram: "After Midnight",
    backdropTone: "from-red-400/20 via-slate-900 to-black",
    posterTone: "from-red-300/25 via-slate-800 to-black",
    isFeatured: true,
    addedAt: "2026-04-18"
  },
  {
    id: "sports-grid",
    type: "channel",
    title: "Sports Grid",
    description: "Live sports coverage, match analysis, and highlight blocks all day.",
    genres: ["Sports", "Live"],
    categories: ["Live TV"],
    quality: ["HD"],
    channelNumber: 205,
    currentProgram: "Match Center",
    nextProgram: "Full Time Review",
    backdropTone: "from-lime-400/20 via-slate-900 to-black",
    posterTone: "from-lime-300/25 via-slate-800 to-black",
    addedAt: "2026-03-30"
  },
  {
    id: "kids-pulse",
    type: "channel",
    title: "Kids Pulse",
    description: "Animation, learning blocks, and family-safe programming.",
    genres: ["Kids", "Animation"],
    categories: ["Live TV"],
    quality: ["HD"],
    channelNumber: 312,
    currentProgram: "Galaxy Scouts",
    nextProgram: "Puzzle Planet",
    backdropTone: "from-amber-300/20 via-slate-900 to-black",
    posterTone: "from-amber-200/25 via-slate-800 to-black",
    addedAt: "2026-02-21"
  }
];
