import { z } from 'zod';

import { EXPERIENCES, LOCATIONS, ROLES } from '~/utils/resumes/resumeFilters';

import { createProtectedRouter } from '../context';

import type { Resume } from '~/types/resume';

export const resumesResumeUserRouter = createProtectedRouter()
  .mutation('upsert', {
    // TODO: Use enums for experience, location, role
    input: z.object({
      additionalInfo: z.string().optional(),
      experience: z.string(),
      id: z.string().optional(),
      location: z.string(),
      role: z.string(),
      title: z.string(),
      url: z.string(),
    }),
    async resolve({ ctx, input }) {
      const userId = ctx.session.user.id;

      return await ctx.prisma.resumesResume.upsert({
        create: {
          additionalInfo: input.additionalInfo,
          experience: input.experience,
          location: input.location,
          role: input.role,
          title: input.title,
          url: input.url,
          userId,
        },
        update: {
          additionalInfo: input.additionalInfo,
          experience: input.experience,
          location: input.location,
          role: input.role,
          title: input.title,
          url: input.url,
          userId,
        },
        where: {
          id: input.id ?? '',
        },
      });
    },
  })
  .mutation('resolve', {
    input: z.object({
      id: z.string(),
      val: z.boolean(),
    }),
    async resolve({ ctx, input }) {
      const resume = await ctx.prisma.resumesResume.update({
        data: {
          isResolved: input.val,
        },
        where: {
          id: input.id,
        },
      });
      return resume.isResolved;
    },
  })
  .query('findUserStarred', {
    input: z.object({
      experienceFilters: z.string().array(),
      isUnreviewed: z.boolean(),
      locationFilters: z.string().array(),
      roleFilters: z.string().array(),
      searchValue: z.string(),
      skip: z.number(),
      sortOrder: z.string(),
      take: z.number(),
    }),
    async resolve({ ctx, input }) {
      const userId = ctx.session.user.id;
      const {
        roleFilters,
        locationFilters,
        experienceFilters,
        searchValue,
        sortOrder,
        isUnreviewed,
        skip,
        take,
      } = input;
      const totalRecords = await ctx.prisma.resumesStar.count({
        where: {
          resume: {
            experience: { in: experienceFilters },
            isResolved: isUnreviewed ? false : {},
            location: { in: locationFilters },
            role: { in: roleFilters },
            title: { contains: searchValue, mode: 'insensitive' },
          },
          userId,
        },
      });
      const resumeStarsData = await ctx.prisma.resumesStar.findMany({
        include: {
          resume: {
            include: {
              _count: {
                select: {
                  comments: true,
                  stars: true,
                },
              },
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy:
          sortOrder === 'latest'
            ? {
                resume: {
                  createdAt: 'desc',
                },
              }
            : sortOrder === 'popular'
            ? {
                resume: {
                  stars: {
                    _count: 'desc',
                  },
                },
              }
            : {
                resume: {
                  comments: {
                    _count: 'desc',
                  },
                },
              },
        skip,
        take,
        where: {
          resume: {
            experience: { in: experienceFilters },
            isResolved: isUnreviewed ? false : {},
            location: { in: locationFilters },
            role: { in: roleFilters },
            title: { contains: searchValue, mode: 'insensitive' },
          },
          userId,
        },
      });

      const mappedResumeData = resumeStarsData.map((rs) => {
        const resume: Resume = {
          additionalInfo: rs.resume.additionalInfo,
          createdAt: rs.resume.createdAt,
          experience: rs.resume.experience,
          id: rs.resume.id,
          isResolved: rs.resume.isResolved,
          isStarredByUser: true,
          location: rs.resume.location,
          numComments: rs.resume._count.comments,
          numStars: rs.resume._count.stars,
          role: rs.resume.role,
          title: rs.resume.title,
          url: rs.resume.url,
          user: rs.resume.user.name!,
        };
        return resume;
      });

      const roleCounts = await ctx.prisma.resumesResume.groupBy({
        _count: {
          _all: true,
        },
        by: ['role'],
        where: {
          experience: { in: experienceFilters },
          isResolved: isUnreviewed ? false : {},
          location: { in: locationFilters },
          stars: {
            some: {
              userId,
            },
          },
          title: { contains: searchValue, mode: 'insensitive' },
        },
      });
      const mappedRoleCounts = Object.fromEntries(
        roleCounts.map((rc) => [rc.role, rc._count._all]),
      );
      const zeroRoleCounts = Object.fromEntries(
        ROLES.filter((r) => !(r.value in mappedRoleCounts)).map((r) => [
          r.value,
          0,
        ]),
      );
      const processedRoleCounts = {
        ...mappedRoleCounts,
        ...zeroRoleCounts,
      };

      const experienceCounts = await ctx.prisma.resumesResume.groupBy({
        _count: {
          _all: true,
        },
        by: ['experience'],
        where: {
          isResolved: isUnreviewed ? false : {},
          location: { in: locationFilters },
          role: { in: roleFilters },
          stars: {
            some: {
              userId,
            },
          },
          title: { contains: searchValue, mode: 'insensitive' },
        },
      });
      const mappedExperienceCounts = Object.fromEntries(
        experienceCounts.map((ec) => [ec.experience, ec._count._all]),
      );
      const zeroExperienceCounts = Object.fromEntries(
        EXPERIENCES.filter((e) => !(e.value in mappedExperienceCounts)).map(
          (e) => [e.value, 0],
        ),
      );
      const processedExperienceCounts = {
        ...mappedExperienceCounts,
        ...zeroExperienceCounts,
      };

      const locationCounts = await ctx.prisma.resumesResume.groupBy({
        _count: {
          _all: true,
        },
        by: ['location'],
        where: {
          experience: { in: experienceFilters },
          isResolved: isUnreviewed ? false : {},
          role: { in: roleFilters },
          stars: {
            some: {
              userId,
            },
          },
          title: { contains: searchValue, mode: 'insensitive' },
        },
      });
      const mappedLocationCounts = Object.fromEntries(
        locationCounts.map((lc) => [lc.location, lc._count._all]),
      );
      const zeroLocationCounts = Object.fromEntries(
        LOCATIONS.filter((l) => !(l.value in mappedLocationCounts)).map((l) => [
          l.value,
          0,
        ]),
      );
      const processedLocationCounts = {
        ...mappedLocationCounts,
        ...zeroLocationCounts,
      };

      const filterCounts = {
        Experience: processedExperienceCounts,
        Location: processedLocationCounts,
        Role: processedRoleCounts,
      };

      return { filterCounts, mappedResumeData, totalRecords };
    },
  })
  .query('findUserCreated', {
    input: z.object({
      experienceFilters: z.string().array(),
      isUnreviewed: z.boolean(),
      locationFilters: z.string().array(),
      roleFilters: z.string().array(),
      searchValue: z.string(),
      skip: z.number(),
      sortOrder: z.string(),
      take: z.number(),
    }),
    async resolve({ ctx, input }) {
      const userId = ctx.session.user.id;
      const {
        roleFilters,
        locationFilters,
        experienceFilters,
        sortOrder,
        searchValue,
        isUnreviewed,
        take,
        skip,
      } = input;
      const totalRecords = await ctx.prisma.resumesResume.count({
        where: {
          experience: { in: experienceFilters },
          isResolved: isUnreviewed ? false : {},
          location: { in: locationFilters },
          role: { in: roleFilters },
          title: { contains: searchValue, mode: 'insensitive' },
          userId,
        },
      });
      const resumesData = await ctx.prisma.resumesResume.findMany({
        include: {
          _count: {
            select: {
              comments: true,
              stars: true,
            },
          },
          stars: {
            where: {
              userId,
            },
          },
          user: {
            select: {
              name: true,
            },
          },
        },
        orderBy:
          sortOrder === 'latest'
            ? {
                createdAt: 'desc',
              }
            : sortOrder === 'popular'
            ? {
                stars: {
                  _count: 'desc',
                },
              }
            : { comments: { _count: 'desc' } },
        skip,
        take,
        where: {
          experience: { in: experienceFilters },
          isResolved: isUnreviewed ? false : {},
          location: { in: locationFilters },
          role: { in: roleFilters },
          title: { contains: searchValue, mode: 'insensitive' },
          userId,
        },
      });
      const mappedResumeData = resumesData.map((r) => {
        const resume: Resume = {
          additionalInfo: r.additionalInfo,
          createdAt: r.createdAt,
          experience: r.experience,
          id: r.id,
          isResolved: r.isResolved,
          isStarredByUser: r.stars.length > 0,
          location: r.location,
          numComments: r._count.comments,
          numStars: r._count.stars,
          role: r.role,
          title: r.title,
          url: r.url,
          user: r.user.name!,
        };
        return resume;
      });

      const roleCounts = await ctx.prisma.resumesResume.groupBy({
        _count: {
          _all: true,
        },
        by: ['role'],
        where: {
          experience: { in: experienceFilters },
          isResolved: isUnreviewed ? false : {},
          location: { in: locationFilters },
          title: { contains: searchValue, mode: 'insensitive' },
          userId,
        },
      });
      const mappedRoleCounts = Object.fromEntries(
        roleCounts.map((rc) => [rc.role, rc._count._all]),
      );
      const zeroRoleCounts = Object.fromEntries(
        ROLES.filter((r) => !(r.value in mappedRoleCounts)).map((r) => [
          r.value,
          0,
        ]),
      );
      const processedRoleCounts = {
        ...mappedRoleCounts,
        ...zeroRoleCounts,
      };

      const experienceCounts = await ctx.prisma.resumesResume.groupBy({
        _count: {
          _all: true,
        },
        by: ['experience'],
        where: {
          isResolved: isUnreviewed ? false : {},
          location: { in: locationFilters },
          role: { in: roleFilters },
          title: { contains: searchValue, mode: 'insensitive' },
          userId,
        },
      });
      const mappedExperienceCounts = Object.fromEntries(
        experienceCounts.map((ec) => [ec.experience, ec._count._all]),
      );
      const zeroExperienceCounts = Object.fromEntries(
        EXPERIENCES.filter((e) => !(e.value in mappedExperienceCounts)).map(
          (e) => [e.value, 0],
        ),
      );
      const processedExperienceCounts = {
        ...mappedExperienceCounts,
        ...zeroExperienceCounts,
      };

      const locationCounts = await ctx.prisma.resumesResume.groupBy({
        _count: {
          _all: true,
        },
        by: ['location'],
        where: {
          experience: { in: experienceFilters },
          isResolved: isUnreviewed ? false : {},
          role: { in: roleFilters },
          title: { contains: searchValue, mode: 'insensitive' },
          userId,
        },
      });
      const mappedLocationCounts = Object.fromEntries(
        locationCounts.map((lc) => [lc.location, lc._count._all]),
      );
      const zeroLocationCounts = Object.fromEntries(
        LOCATIONS.filter((l) => !(l.value in mappedLocationCounts)).map((l) => [
          l.value,
          0,
        ]),
      );
      const processedLocationCounts = {
        ...mappedLocationCounts,
        ...zeroLocationCounts,
      };

      const filterCounts = {
        Experience: processedExperienceCounts,
        Location: processedLocationCounts,
        Role: processedRoleCounts,
      };

      return { filterCounts, mappedResumeData, totalRecords };
    },
  });
