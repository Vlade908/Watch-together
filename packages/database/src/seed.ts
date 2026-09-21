import { prisma } from "./index";

async function main() {
  console.log("[Seed] Populando banco de dados com catálogo expandido, amigos e ratings...");

  // 1. Cria usuário principal e amigos de teste
  const user = await prisma.user.upsert({
    where: { email: "usuario@watchtogether.com" },
    update: {},
    create: {
      email: "usuario@watchtogether.com",
      name: "Vlad Explorador",
      passwordHash: "hash_de_teste",
      profiles: {
        create: [
          {
            name: "Vlad Principal",
            isKid: false,
          },
          {
            name: "Kids Mode",
            isKid: true,
          },
        ],
      },
    },
    include: { profiles: true },
  });

  const friend1 = await prisma.user.upsert({
    where: { email: "beatriz.ramos@watchtogether.com" },
    update: {},
    create: {
      email: "beatriz.ramos@watchtogether.com",
      name: "Beatriz Ramos",
      passwordHash: "hash_de_teste",
      profiles: {
        create: [{ name: "Beatriz", isKid: false }],
      },
    },
    include: { profiles: true },
  });

  const friend2 = await prisma.user.upsert({
    where: { email: "lucas.alencar@watchtogether.com" },
    update: {},
    create: {
      email: "lucas.alencar@watchtogether.com",
      name: "Lucas Alencar",
      passwordHash: "hash_de_teste",
      profiles: {
        create: [{ name: "Lucas", isKid: false }],
      },
    },
    include: { profiles: true },
  });

  // Amizades aceitas
  await prisma.friendship.upsert({
    where: {
      senderId_receiverId: {
        senderId: user.id,
        receiverId: friend1.id,
      },
    },
    update: { status: "ACCEPTED" },
    create: {
      senderId: user.id,
      receiverId: friend1.id,
      status: "ACCEPTED",
    },
  });

  await prisma.friendship.upsert({
    where: {
      senderId_receiverId: {
        senderId: user.id,
        receiverId: friend2.id,
      },
    },
    update: { status: "ACCEPTED" },
    create: {
      senderId: user.id,
      receiverId: friend2.id,
      status: "ACCEPTED",
    },
  });

  console.log(`[Seed] Usuários e conexões de amizade criados com sucesso!`);

  // 2. Catálogo completo de 10 títulos
  const titles = [
    {
      slug: "interestelar-alem-do-horizonte",
      name: "Interestelar: Além do Horizonte",
      synopsis:
        "Com a Terra à beira do colapso por pragas globais, um grupo de exploradores espaciais viaja através de uma fenda no espaço-tempo em busca de um novo lar para a humanidade.",
      releaseYear: 2024,
      ageRating: "12",
      durationMinutes: 169,
      type: "MOVIE" as const,
      bannerUrl: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2070&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=800&auto=format&fit=crop",
      genres: ["Ficção Científica", "Drama Espacial", "Aventura Épica"],
    },
    {
      slug: "cyber-odyssey-2088",
      name: "Cyber Odyssey: 2088",
      synopsis:
        "Em uma megalópole hiperconectada dominada por inteligências artificiais e sindicatos corporativos, um caçador de andróides rebeldes descobre uma conspiração de senciência digital.",
      releaseYear: 2025,
      ageRating: "16",
      durationMinutes: 128,
      type: "MOVIE" as const,
      bannerUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=2070&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=800&auto=format&fit=crop",
      genres: ["Cyberpunk", "Ação", "Distopia", "Sci-Fi"],
    },
    {
      slug: "o-enigma-de-orion",
      name: "O Enigma de Órion",
      synopsis:
        "O desaparecimento misterioso de um radioastrônomo na Antártida revela uma transmissão criptografada com harmônicos físicos que desafiam o conhecimento humano.",
      releaseYear: 2025,
      ageRating: "16",
      durationMinutes: null,
      type: "SERIES" as const,
      bannerUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=800&auto=format&fit=crop",
      genres: ["Mistério Cibernético", "Ficção Científica", "Suspense"],
    },
    {
      slug: "deserto-eterno",
      name: "Deserto Eterno: Dunas",
      synopsis:
        "Um jovem nobre é lançado em um planeta desértico hostil e precisa liderar os povos nômades em uma revolta contra a tirania imperial pelo controle da especiaria cósmica.",
      releaseYear: 2024,
      ageRating: "14",
      durationMinutes: 166,
      type: "MOVIE" as const,
      bannerUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=2070&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=800&auto=format&fit=crop",
      genres: ["Épico", "Ficção Científica", "Fantasia"],
    },
    {
      slug: "sintetizador-de-consciencia",
      name: "Sintetizador de Alma",
      synopsis:
        "Um neurocientista cria um dispositivo neural capaz de gravar e reproduzir estados emocionais humanos puros, desencadeando um comércio clandestino de memórias.",
      releaseYear: 2025,
      ageRating: "16",
      durationMinutes: 132,
      type: "MOVIE" as const,
      bannerUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=2070&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=800&auto=format&fit=crop",
      genres: ["Ficção Filosófica", "Drama Psicológico", "Suspense"],
    },
    {
      slug: "cronicas-do-vazio",
      name: "Crônicas do Vazio",
      synopsis:
        "Três astronautas ficam isolados em uma cápsula de escape danificada após a destruição da estação orbital Lunar Gateway e enfrentam a escassez crítica de oxigênio.",
      releaseYear: 2024,
      ageRating: "14",
      durationMinutes: 115,
      type: "MOVIE" as const,
      bannerUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=2070&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop",
      genres: ["Sobrevivência", "Suspense", "Espacial"],
    },
    {
      slug: "detetives-de-neon",
      name: "Detetives de Neon",
      synopsis:
        "Nas vielas chuvosas iluminadas por hologramas, uma detetive renegada e um hacker investigam mortes inexplicáveis causadas por sobrecarga de sinapses neurais.",
      releaseYear: 2025,
      ageRating: "18",
      durationMinutes: null,
      type: "SERIES" as const,
      bannerUrl: "https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=2070&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=800&auto=format&fit=crop",
      genres: ["Neo-Noir", "Crime", "Cyberpunk"],
    },
    {
      slug: "horizonte-profundo",
      name: "Horizonte Profundo",
      synopsis:
        "Uma estação submarina em uma fossa oceânica a 11.000 metros de profundidade perfura uma câmara selada da era primordial e liberta entidades adaptadas à escuridão extrema.",
      releaseYear: 2024,
      ageRating: "16",
      durationMinutes: 110,
      type: "MOVIE" as const,
      bannerUrl: "https://images.unsplash.com/photo-1484589065579-248aad0d8b13?q=80&w=2070&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1484589065579-248aad0d8b13?q=80&w=800&auto=format&fit=crop",
      genres: ["Horror Subaquático", "Sci-Fi", "Ação"],
    },
    {
      slug: "ecos-do-passado",
      name: "Ecos do Passado",
      synopsis:
        "Um historiador quântico utiliza simulações de partículas para reconstruir eventos do século XX, até que uma divergência histórica começa a alterar sua própria realidade.",
      releaseYear: 2024,
      ageRating: "14",
      durationMinutes: 138,
      type: "MOVIE" as const,
      bannerUrl: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2070&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop",
      genres: ["Drama Histórico", "Ficção Científica", "Viagem no Tempo"],
    },
    {
      slug: "rebeliao-quantica",
      name: "Rebelião Quântica",
      synopsis:
        "Em um mundo onde decisões cotidianas são calculadas por supercomputadores preditivos, um coletivo clandestino descobre como introduzir entropia e retomar o livre arbítrio.",
      releaseYear: 2025,
      ageRating: "16",
      durationMinutes: 122,
      type: "MOVIE" as const,
      bannerUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop",
      posterUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&auto=format&fit=crop",
      genres: ["Ação", "Cyberpunk", "Thriller Tecnológico"],
    },
  ];

  const createdTitles: Record<string, string> = {};

  for (const t of titles) {
    const created = await prisma.title.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        synopsis: t.synopsis,
        genres: t.genres,
        bannerUrl: t.bannerUrl,
        posterUrl: t.posterUrl,
        releaseYear: t.releaseYear,
        durationMinutes: t.durationMinutes,
        type: t.type,
      },
      create: {
        ...t,
        mediaAsset: {
          create: {
            masterPlaylistUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            durationSeconds: 634.0,
            status: "READY",
            hlsResolutions: [
              { resolution: "1080p", bandwidth: 4800000 },
              { resolution: "720p", bandwidth: 2700000 },
              { resolution: "480p", bandwidth: 1350000 },
              { resolution: "360p", bandwidth: 700000 },
            ],
          },
        },
      },
    });
    createdTitles[t.slug] = created.id;
    console.log(`[Seed] Título semeado: ${created.name}`);
  }

  // 3. Popula histórico de visualização (Watch Progress)
  const userProfile = user.profiles[0];
  const friend1Profile = friend1.profiles[0];
  const friend2Profile = friend2.profiles[0];

  // Limpa registros anteriores de teste para recriar
  await prisma.watchProgress.deleteMany({});

  if (userProfile) {
    // Vlad assistiu Interestelar (45%) e Cyber Odyssey (100%)
    await prisma.watchProgress.create({
      data: {
        profileId: userProfile.id,
        titleId: createdTitles["interestelar-alem-do-horizonte"],
        percentageCompleted: 45,
        lastPositionSeconds: 285.0,
        durationSeconds: 634.0,
        isFinished: false,
      },
    });

    await prisma.watchProgress.create({
      data: {
        profileId: userProfile.id,
        titleId: createdTitles["cyber-odyssey-2088"],
        percentageCompleted: 100,
        lastPositionSeconds: 634.0,
        durationSeconds: 634.0,
        isFinished: true,
      },
    });
  }

  // Amigos assistiram outros títulos (Sinais Sociais)
  if (friend1Profile) {
    await prisma.watchProgress.create({
      data: {
        profileId: friend1Profile.id,
        titleId: createdTitles["deserto-eterno"],
        percentageCompleted: 95,
        lastPositionSeconds: 600.0,
        durationSeconds: 634.0,
        isFinished: true,
      },
    });

    await prisma.watchProgress.create({
      data: {
        profileId: friend1Profile.id,
        titleId: createdTitles["o-enigma-de-orion"],
        percentageCompleted: 80,
        lastPositionSeconds: 500.0,
        durationSeconds: 634.0,
        isFinished: false,
      },
    });
  }

  if (friend2Profile) {
    await prisma.watchProgress.create({
      data: {
        profileId: friend2Profile.id,
        titleId: createdTitles["deserto-eterno"],
        percentageCompleted: 88,
        lastPositionSeconds: 560.0,
        durationSeconds: 634.0,
        isFinished: false,
      },
    });
  }

  // 4. Popula ratings para futuro pipeline ML
  await prisma.userRating.upsert({
    where: {
      userId_titleId: {
        userId: user.id,
        titleId: createdTitles["interestelar-alem-do-horizonte"],
      },
    },
    update: { rating: 5.0 },
    create: {
      userId: user.id,
      titleId: createdTitles["interestelar-alem-do-horizonte"],
      rating: 5.0,
    },
  });

  await prisma.userRating.upsert({
    where: {
      userId_titleId: {
        userId: user.id,
        titleId: createdTitles["cyber-odyssey-2088"],
      },
    },
    update: { rating: 4.5 },
    create: {
      userId: user.id,
      titleId: createdTitles["cyber-odyssey-2088"],
      rating: 4.5,
    },
  });

  await prisma.userRating.upsert({
    where: {
      userId_titleId: {
        userId: friend1.id,
        titleId: createdTitles["deserto-eterno"],
      },
    },
    update: { rating: 5.0 },
    create: {
      userId: friend1.id,
      titleId: createdTitles["deserto-eterno"],
      rating: 5.0,
    },
  });

  console.log("[Seed] População completa concluída com sucesso!");
}

main()
  .catch((e) => {
    console.error("[Seed] Erro ao popular banco:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
