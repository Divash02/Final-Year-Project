import React from "react";
import {
  faArrowRight,
  faBookmark,
  faBuilding,
  faCalendarDays,
  faGraduationCap,
  faPencil,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

export interface CourseCardData {
  id: number | string;
  code: string;
  name: string;
  department: string | null;
  credits: number;
  semester?: number | null;
  academicYear?: string | null;
  program?: string | null;
  courseType?: string;
}

interface CourseCardProps {
  course: CourseCardData;
  onView?: (course: CourseCardData) => void;
  onEdit?: (course: CourseCardData) => void;
}
const COURSE_COLOR_PALETTE = [
  { gradient: "from-indigo-500 to-indigo-600", accent: "bg-indigo-500", iconBg: "bg-white/20" },
  { gradient: "from-blue-600 to-blue-700", accent: "bg-blue-600", iconBg: "bg-white/20" },
  { gradient: "from-emerald-500 to-emerald-600", accent: "bg-emerald-500", iconBg: "bg-white/20" },
  { gradient: "from-violet-500 to-violet-600", accent: "bg-violet-500", iconBg: "bg-white/20" },
  { gradient: "from-amber-500 to-amber-600", accent: "bg-amber-500", iconBg: "bg-white/20" },
  { gradient: "from-cyan-500 to-cyan-600", accent: "bg-cyan-500", iconBg: "bg-white/20" },
  { gradient: "from-slate-600 to-slate-700", accent: "bg-slate-600", iconBg: "bg-white/20" },
];
function getCourseArtwork(course: any) {
  const name = course.name.toLowerCase();
  const code = course.code.toLowerCase();

  if (name.includes("database") || name.includes("db") || code.includes("db")) {
    return {
      icon: faBookmark,
      ...COURSE_COLOR_PALETTE[2],
      pattern: "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.25) 0%, transparent 60%)",
    };
  }
  if (name.includes("network") || name.includes("data centre") || name.includes("distributed")) {
    return {
      icon: faBuilding,
      ...COURSE_COLOR_PALETTE[1],
      pattern: "radial-gradient(circle at 80% 0%, rgba(255,255,255,0.2) 0%, transparent 60%)",
    };
  }
  if (name.includes("python") || name.includes("programming") || name.includes("java") || name.includes("development")) {
    return {
      icon: faGraduationCap,
      ...COURSE_COLOR_PALETTE[0],
      pattern: "radial-gradient(circle at 0% 80%, rgba(255,255,255,0.2) 0%, transparent 60%)",
    };
  }
  if (name.includes("cloud") || name.includes("iot") || name.includes("blockchain")) {
    return {
      icon: faBookmark,
      ...COURSE_COLOR_PALETTE[3],
      pattern: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.25) 0%, transparent 70%)",
    };
  }
  if (name.includes("web") || name.includes("hci") || name.includes("interaction")) {
    return {
      icon: faCalendarDays,
      ...COURSE_COLOR_PALETTE[4],
      pattern: "radial-gradient(circle at 90% 90%, rgba(255,255,255,0.2) 0%, transparent 60%)",
    };
  }
  if (name.includes("math") || name.includes("system") || name.includes("analysis")) {
    return {
      icon: faGraduationCap,
      ...COURSE_COLOR_PALETTE[5],
      pattern: "radial-gradient(circle at 10% 20%, rgba(255,255,255,0.2) 0%, transparent 60%)",
    };
  }

  const index = course.code.charCodeAt(0) % COURSE_COLOR_PALETTE.length;
  return {
    icon: faBookmark,
    ...COURSE_COLOR_PALETTE[index],
    pattern: "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.2) 0%, transparent 70%)",
  };
}
export const CourseCard: React.FC<CourseCardProps> = ({ course, onView, onEdit }) => {
  const artwork = getCourseArtwork(course);
  const level = course.semester ? Math.ceil(course.semester / 2) : null;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl focus-within:-translate-y-1 focus-within:shadow-xl">
<div className="relative flex h-[130px] items-start justify-between overflow-hidden p-5 text-white">
          <img src="/images/course_image.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/10 to-transparent" />
        <div className="relative z-10 flex flex-col gap-2">
          <span className="inline-flex items-center rounded-lg bg-white/25 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide shadow-sm backdrop-blur-sm">
            {course.code}
          </span>
          {course.courseType && (
            <Badge variant="neutral" className="w-fit bg-white/90 text-slate-700 shadow-sm">
              {course.courseType}
            </Badge>
          )}
        </div>
        <div
          className={"relative z-10 flex h-11 w-11 items-center justify-center rounded-xl " + artwork.iconBg + " shadow-sm backdrop-blur-sm"}
        >
          <FontAwesomeIcon icon={artwork.icon} className="text-xl" aria-hidden="true" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900">
            {course.name}
          </h3>
          {course.department && (
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <FontAwesomeIcon icon={faBuilding} className="text-slate-400" aria-hidden="true" />
              <span className="truncate">{course.department}</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600">
          {course.semester !== null && course.semester !== undefined && (
            <div className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faCalendarDays} className="text-slate-400" aria-hidden="true" />
              <span>
                Semester {course.semester}
                {level !== null && " · Level " + level}
              </span>
            </div>
          )}
          {course.credits > 0 && (
            <div className="flex items-center gap-1.5">
              <FontAwesomeIcon icon={faGraduationCap} className="text-slate-400" aria-hidden="true" />
              <span>{course.credits} Credits</span>
            </div>
          )}
          {course.academicYear && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                AY {course.academicYear}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
        <div className="flex items-center gap-1.5">
          <span className={"h-2 w-2 rounded-full " + artwork.accent} aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
            Academic Course
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button
              size="sm"
              variant="outline"
              icon={faPencil}
              iconPosition="left"
              onClick={() => onEdit(course)}
            >
              Edit
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon={faArrowRight}
            iconPosition="right"
            onClick={() => onView && onView(course)}
            className="shadow-sm transition-transform duration-150 group-hover:translate-x-0.5"
          >
            View Course
          </Button>
        </div>
      </div>
    </article>
  );
};

