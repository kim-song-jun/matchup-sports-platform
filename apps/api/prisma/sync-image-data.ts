import type { PrismaClient } from '@prisma/client';
import {
  getLessonSeedImages,
  getListingSeedImages,
  getMatchSeedImage,
  getTeamCoverSeedImage,
  getTeamPhotoSeedImages,
  getVenueSeedImages,
  isLocalMockAsset,
} from './mock-image-catalog';

function unique(items: Array<string | null | undefined>) {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item))));
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function mergeManagedGallery(existing: string[], generated: string[], limit: number) {
  const preservedRemote = existing.filter((image) => !isLocalMockAsset(image));
  return unique([...preservedRemote, ...generated]).slice(0, limit);
}

function mergeManagedSingle(existing: string | null, generated: string) {
  if (existing && !isLocalMockAsset(existing)) {
    return existing;
  }
  return generated;
}

export async function syncImageData(prisma: PrismaClient) {
  console.log('🖼️ Syncing image data...');

  let updatedVenues = 0;
  let updatedMatches = 0;
  let updatedLessons = 0;
  let updatedListings = 0;
  let updatedTeams = 0;

  const venues = await prisma.venue.findMany({
    select: {
      id: true,
      sportTypes: true,
      imageUrls: true,
    },
  });

  const venueImageMap = new Map<string, string[]>();

  for (const venue of venues) {
    const nextImageUrls = mergeManagedGallery(
      venue.imageUrls,
      getVenueSeedImages(venue.sportTypes, venue.id, 4),
      4,
    );

    venueImageMap.set(venue.id, nextImageUrls);

    if (!arraysEqual(venue.imageUrls, nextImageUrls)) {
      await prisma.venue.update({
        where: { id: venue.id },
        data: { imageUrls: nextImageUrls },
      });
      updatedVenues += 1;
    }
  }

  const matches = await prisma.match.findMany({
    select: {
      id: true,
      sportType: true,
      imageUrl: true,
      venueId: true,
    },
  });

  for (const match of matches) {
    const venueImages = venueImageMap.get(match.venueId) ?? [];
    const nextImageUrl = mergeManagedSingle(
      match.imageUrl,
      getMatchSeedImage(match.sportType, venueImages, match.id),
    );

    if (match.imageUrl !== nextImageUrl) {
      await prisma.match.update({
        where: { id: match.id },
        data: { imageUrl: nextImageUrl },
      });
      updatedMatches += 1;
    }
  }

  const lessons = await prisma.lesson.findMany({
    select: {
      id: true,
      sportType: true,
      imageUrls: true,
      venueId: true,
    },
  });

  for (const lesson of lessons) {
    const venueImages = lesson.venueId ? (venueImageMap.get(lesson.venueId) ?? []) : [];
    const nextImageUrls = mergeManagedGallery(
      lesson.imageUrls,
      getLessonSeedImages(lesson.sportType, venueImages, lesson.id, 4),
      4,
    );

    if (!arraysEqual(lesson.imageUrls, nextImageUrls)) {
      await prisma.lesson.update({
        where: { id: lesson.id },
        data: { imageUrls: nextImageUrls },
      });
      updatedLessons += 1;
    }
  }

  const listings = await prisma.marketplaceListing.findMany({
    select: {
      id: true,
      sportType: true,
      imageUrls: true,
    },
  });

  for (const listing of listings) {
    const nextImageUrls = mergeManagedGallery(
      listing.imageUrls,
      getListingSeedImages(listing.sportType, listing.id, 4),
      4,
    );

    if (!arraysEqual(listing.imageUrls, nextImageUrls)) {
      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: { imageUrls: nextImageUrls },
      });
      updatedListings += 1;
    }
  }

  const teams = await prisma.sportTeam.findMany({
    select: {
      id: true,
      sportType: true,
      coverImageUrl: true,
      photos: true,
    },
  });

  for (const team of teams) {
    const nextCoverImageUrl = mergeManagedSingle(
      team.coverImageUrl,
      getTeamCoverSeedImage(team.sportType, team.id),
    );
    const nextPhotos = mergeManagedGallery(
      team.photos,
      getTeamPhotoSeedImages(team.sportType, team.id, 3),
      3,
    );

    if (team.coverImageUrl !== nextCoverImageUrl || !arraysEqual(team.photos, nextPhotos)) {
      await prisma.sportTeam.update({
        where: { id: team.id },
        data: {
          coverImageUrl: nextCoverImageUrl,
          photos: nextPhotos,
        },
      });
      updatedTeams += 1;
    }
  }

  console.log(
    `  ✅ image sync complete (venues: ${updatedVenues}, matches: ${updatedMatches}, lessons: ${updatedLessons}, listings: ${updatedListings}, teams: ${updatedTeams})`,
  );
}
