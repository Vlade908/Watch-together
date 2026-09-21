export interface EpisodeItem {
  id: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  durationMinutes: number;
  thumbnailUrl: string;
}

export interface SeasonItem {
  seasonNumber: number;
  name: string;
  episodes: EpisodeItem[];
}

export interface CatalogTitle {
  id: string;
  slug: string;
  name: string;
  synopsis: string;
  longSynopsis?: string;
  releaseYear: number;
  ageRating: string;
  durationMinutes?: number;
  totalSeasons?: number;
  type: "MOVIE" | "SERIES";
  bannerUrl: string;
  posterUrl?: string;
  previewVideoUrl?: string;
  matchPercentage: number;
  genres: string[];
  cast: string[];
  director: string;
  moods: string[];
  isTop10?: boolean;
  top10Rank?: number;
  progressPercentage?: number;
  friendsWatchedCount?: number;
  seasons?: SeasonItem[];
  similarTitles?: string[];
}

export const CATALOG_DATA: CatalogTitle[] = [
  {
    id: "interstellar-1",
    slug: "interestelar-alem-do-horizonte",
    name: "Interestelar: Além do Horizonte",
    synopsis:
      "Com a Terra à beira do colapso, uma equipe de astronautas viaja através de um buraco de minhoca em busca de um novo lar para salvar a humanidade.",
    longSynopsis:
      "As reservas naturais da Terra estão chegando ao fim e um grupo de cientistas e exploradores recebe a missão mais crucial da história humana: viajar através de uma fenda no espaço-tempo e verificar a habitabilidade de três planetas promissores em outra galáxia.",
    releaseYear: 2024,
    ageRating: "12",
    durationMinutes: 169,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    matchPercentage: 98,
    genres: ["Ficção Científica", "Drama Espacial", "Aventura Épica"],
    cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain"],
    director: "Christopher Nolan",
    moods: ["Cerebral", "Emocionante", "Visualmente Deslumbrante"],
    isTop10: true,
    top10Rank: 1,
    progressPercentage: 45,
    friendsWatchedCount: 4,
    similarTitles: ["cyber-odyssey-2", "orion-3", "space-void-4"],
  },
  {
    id: "stranger-series-1",
    slug: "o-enigma-de-orion",
    name: "O Enigma de Órion",
    synopsis:
      "O desaparecimento misterioso de um radioastrônomo na Antártida revela uma transmissão criptografada com origens fora do sistema solar.",
    longSynopsis:
      "Durante o rigoroso inverno polar de uma base científica isolada na Antártida, um sinal eletromagnético pulsante é captado por receptores subglaciais. Quando o cientista responsável some sem deixar vestígios, a equipe descobre uma conspiração de proporções cósmicas.",
    releaseYear: 2025,
    ageRating: "16",
    totalSeasons: 2,
    type: "SERIES",
    bannerUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=800&auto=format&fit=crop",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    matchPercentage: 96,
    genres: ["Mistério Cibernético", "Ficção Científica", "Suspense"],
    cast: ["Alexander Skarsgård", "Rebecca Ferguson", "David Dastmalchian"],
    director: "Denis Villeneuve",
    moods: ["Sombrio", "Tenso", "Instigante"],
    isTop10: true,
    top10Rank: 2,
    friendsWatchedCount: 6,
    seasons: [
      {
        seasonNumber: 1,
        name: "Temporada 1",
        episodes: [
          {
            id: "orion-s1-e1",
            episodeNumber: 1,
            title: "Frequência Subglacial",
            synopsis: "A antena receptora da Estação Amundsen capta pulsos harmônicos que violam as leis conhecidas da física.",
            durationMinutes: 54,
            thumbnailUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop",
          },
          {
            id: "orion-s1-e2",
            episodeNumber: 2,
            title: "O Eco do Vazio",
            synopsis: "Conforme a equipe tenta isolar o sinal, as comunicações externas caem misteriosamente.",
            durationMinutes: 48,
            thumbnailUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&auto=format&fit=crop",
          },
        ],
      },
    ],
  },
  {
    id: "cyber-odyssey-2",
    slug: "cyber-odyssey-2088",
    name: "Cyber Odyssey: 2088",
    synopsis:
      "Em uma Neo-Metrópole dominada por megacorporações, um agente cibernético descobre um código ancestral capaz de conceder senciência às máquinas.",
    longSynopsis:
      "Ano de 2088. As fronteiras entre biologia e silício se dissolveram no submundo repleto de néon. Um investigador particular com aprimoramentos neurais ilegais é contratado para rastrear o misterioso 'Arquiteto Fantasma'.",
    releaseYear: 2025,
    ageRating: "16",
    durationMinutes: 128,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=800&auto=format&fit=crop",
    previewVideoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    matchPercentage: 99,
    genres: ["Cyberpunk", "Ação", "Distopia"],
    cast: ["Keanu Reeves", "Ana de Armas", "Hiroyuki Sanada"],
    director: "Chad Stahelski",
    moods: ["Frenético", "Estilizado", "Distópico"],
    isTop10: true,
    top10Rank: 3,
    progressPercentage: 72,
    friendsWatchedCount: 5,
  },
  {
    id: "desert-eternity-5",
    slug: "deserto-eterno",
    name: "Deserto Eterno: Dunas",
    synopsis:
      "Um jovem nobre é lançado em um planeta desértico letal e precisa liderar os povos nativos em uma revolta contra a tirania imperial.",
    longSynopsis:
      "O planeta Arrakis é a única fonte conhecida do elemento mais valioso do universo. Traído pelo imperador e caçado por inimigos mortais, o herdeiro Paul precisa dominar os vermes gigantes das areias.",
    releaseYear: 2024,
    ageRating: "14",
    durationMinutes: 166,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=800&auto=format&fit=crop",
    matchPercentage: 97,
    genres: ["Épico", "Ficção Científica", "Fantasia"],
    cast: ["Timothée Chalamet", "Zendaya", "Javier Bardem"],
    director: "Denis Villeneuve",
    moods: ["Grandioso", "Hipnotizante", "Imersivo"],
    isTop10: true,
    top10Rank: 4,
    friendsWatchedCount: 8,
  },
  {
    id: "ai-synth-8",
    slug: "sintetizador-de-consciencia",
    name: "Sintetizador de Alma",
    synopsis:
      "Um neurocientista cria um algoritmo capaz de gravar e reproduzir estados emocionais puros, desencadeando um vício sem precedentes.",
    longSynopsis:
      "O que aconteceria se você pudesse sentir o amor, o luto ou o êxtase de outra pessoa com perfeição biológica? O projeto 'Nexus Soul' rapidamente se transforma na droga mais perigosa do mercado negro.",
    releaseYear: 2025,
    ageRating: "16",
    durationMinutes: 132,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop",
    matchPercentage: 99,
    genres: ["Ficção Filosófica", "Drama Psicológico"],
    cast: ["Cillian Murphy", "Rooney Mara"],
    director: "Alex Garland",
    moods: ["Melancólico", "Provocativo", "Hipnótico"],
    isTop10: true,
    top10Rank: 5,
  },
  {
    id: "space-void-4",
    slug: "cronicas-do-vazio",
    name: "Crônicas do Vazio",
    synopsis:
      "Três astronautas ficam à deriva após a destruição acidental da estação orbital Lunar Gateway e lutam contra o oxigênio.",
    longSynopsis:
      "Uma tempestade de detritos espaciais destrói a maior estação de pesquisa cislunar em minutos. Isolados em uma cápsula de fuga danificada, a tripulação precisa resolver enigmas de física orbital para sobreviver.",
    releaseYear: 2024,
    ageRating: "14",
    durationMinutes: 115,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop",
    matchPercentage: 93,
    genres: ["Sobrevivência", "Suspense", "Espacial"],
    cast: ["Sandra Bullock", "George Clooney"],
    director: "Alfonso Cuarón",
    moods: ["Agoniante", "Claustrofóbico", "Realista"],
    isTop10: true,
    top10Rank: 6,
    friendsWatchedCount: 3,
  },
  {
    id: "neon-detectives-6",
    slug: "detetives-de-neon",
    name: "Detetives de Neon",
    synopsis:
      "Nas vielas iluminadas por hologramas, uma dupla de investigadores apura crimes cometidos por mentes conectadas em rede neural.",
    longSynopsis:
      "Quando magnatas da biotecnologia são encontrados mortos com implantes neurais sobrecarregados, uma detetive renegada e um ex-hacker assumem o caso, mergulhando no submundo da dark web.",
    releaseYear: 2025,
    ageRating: "18",
    totalSeasons: 1,
    type: "SERIES",
    bannerUrl: "https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=800&auto=format&fit=crop",
    matchPercentage: 91,
    genres: ["Neo-Noir", "Crime", "Cyberpunk"],
    cast: ["Mahershala Ali", "Karl Urban"],
    director: "David Fincher",
    moods: ["Cínico", "Violento", "Elegante"],
    isTop10: true,
    top10Rank: 7,
    friendsWatchedCount: 2,
  },
  {
    id: "deep-horizon-7",
    slug: "horizonte-profundo",
    name: "Horizonte Profundo",
    synopsis:
      "Uma base submarina a 11.000 metros de profundidade perfura uma câmara geológica selada há milhões de anos.",
    longSynopsis:
      "A pressão esmagadora do abismo oceânico é apenas o início do pesadelo quando uma broca termo-nuclear atinge um oceano primordial sob a crosta terrestre, despertando predadores ancestrais.",
    releaseYear: 2024,
    ageRating: "16",
    durationMinutes: 110,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1484589065579-248aad0d8b13?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1484589065579-248aad0d8b13?q=80&w=800&auto=format&fit=crop",
    matchPercentage: 89,
    genres: ["Horror Subaquático", "Sci-Fi", "Ação"],
    cast: ["Kristen Stewart", "Vincent Cassel"],
    director: "William Eubank",
    moods: ["Assustador", "Claustrofóbico", "Rápido"],
    isTop10: true,
    top10Rank: 8,
  },
  {
    id: "quantum-paradox-9",
    slug: "o-paradoxo-quantico",
    name: "O Paradoxo Quântico",
    synopsis:
      "Físicos nucleares em Genebra acidentalmente colapsam duas linhas temporais paralelas em uma única realidade instável.",
    longSynopsis:
      "Durante o teste de potência máxima do acelerador de partículas subatômicas, uma anomalia rasga o tecido dimensional. Os cientistas começam a cruzar com versões alternativas de si mesmos.",
    releaseYear: 2025,
    ageRating: "14",
    durationMinutes: 118,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1507499739999-097706ad8914?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1507499739999-097706ad8914?q=80&w=800&auto=format&fit=crop",
    matchPercentage: 95,
    genres: ["Ficção Científica", "Suspense Teórico"],
    cast: ["Benedict Cumberbatch", "Rachel McAdams"],
    director: "Sam Esmail",
    moods: ["Cerebral", "Intriga", "Eletrizante"],
    isTop10: true,
    top10Rank: 9,
  },
  {
    id: "solaris-rebirth-10",
    slug: "solaris-o-renascimento",
    name: "Solaris: Renascimento",
    synopsis:
      "Um oceano senciente que cobre um planeta distante começa a materializar memórias e fantasmas da tripulação de cientistas.",
    longSynopsis:
      "A estação científica pairando sobre o misterioso planeta aquático Solaris perdeu contato com a Terra. Um psicólogo é enviado para avaliar a sanidade dos pesquisadores, apenas para encontrar a encarnação viva de seu maior arrependimento do passado.",
    releaseYear: 2024,
    ageRating: "14",
    durationMinutes: 142,
    type: "MOVIE",
    bannerUrl: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=2070&auto=format&fit=crop",
    posterUrl: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=800&auto=format&fit=crop",
    matchPercentage: 94,
    genres: ["Ficção Filosófica", "Mistério", "Drama"],
    cast: ["George Clooney", "Natascha McElhone"],
    director: "Steven Soderbergh",
    moods: ["Profundo", "Poético", "Misterioso"],
    isTop10: true,
    top10Rank: 10,
  },
];
