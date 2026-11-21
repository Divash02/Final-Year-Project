import React, { useCallback, useEffect, useRef, useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { getNepalDateTime } from "../../lib/nepaliCalendar";
import { resolveInstitutionTimeZone } from "../../lib/institutionTime";
import { UserRoleType } from "../../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faMagnifyingGlass,
  faGlobe,
  faCalendarDays,
  faShieldHalved,
  faChevronDown,
  faRightFromBracket,
  faBars,
  faXmark,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { IconButton } from "../ui/IconButton";
import { BrandLogo } from "./BrandLogo";
import { NotificationCenter } from "./NotificationCenter";
import { fetchUnreadCount } from "../../services/notificationsApi";
import { useNotificationSocket } from "../../services/notificationSocket";

export const ROLE_LABELS: Record<UserRoleType, string> = {
  super_admin: "Super Admin",
  campus_admin: "Campus Admin",
  dean: "Dean",
  hod: "Department Head",
  program_coordinator: "Program Coordinator",
  registrar: "Registrar",
  exam_officer: "Exam Officer",
  finance_officer: "Finance Officer",
  faculty: "Faculty",
  student: "Student",
  parent: "Parent",
  security_staff: "Security Staff",
};

export const Navbar: React.FC = () => {
  const {
    language,
    setLanguage,
    calendarType,
    setCalendarType,
    currentTenant,
    currentRole,
    setCurrentRole,
    setActiveView,
    logout,
    currentUser,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
  } = useCollegeOS();

  /**
   * Unread count is sourced from the institution database and kept in sync
   * via the authenticated notification socket.
   */
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const result = await fetchUnreadCount();
      setUnreadCount(result.unreadCount || 0);
    } catch {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }
    void loadUnreadCount();
  }, [currentUser, loadUnreadCount]);

  useNotificationSocket(Boolean(currentUser), {
    onUnread: (p) => {
      if (typeof p?.unreadCount === "number") setUnreadCount(p.unreadCount);
    },
    onNew: (n) => {
      if (n && !n.read) setUnreadCount((c) => c + 1);
    },
  });

  const [showNotifs, setShowNotifs] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentNepalTime, setCurrentNepalTime] = useState(() =>
    getNepalDateTime(),
  );
  const notificationsRef = useRef<HTMLDivElement>(null);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = window.setInterval(
      () => setCurrentNepalTime(getNepalDateTime()),
      1000,
    );
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!showNotifs && !showRoleMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        showNotifs &&
        notificationsRef.current &&
        !notificationsRef.current.contains(target)
      ) {
        setShowNotifs(false);
      }
      if (
        showRoleMenu &&
        roleMenuRef.current &&
        !roleMenuRef.current.contains(target)
      ) {
        setShowRoleMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowNotifs(false);
        setShowRoleMenu(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showNotifs, showRoleMenu]);

  const userRoles =
    currentUser?.roles && currentUser.roles.length > 0
      ? currentUser.roles
      : [currentRole];
  const switchableRoles = userRoles.filter(
    (role): role is UserRoleType => role !== undefined,
  );
  const timeZone = resolveInstitutionTimeZone(currentTenant.config.timezone);

  return (
    <header className="sticky top-0 z-[200] h-16 w-full shrink-0 bg-white">
      <div className="flex h-full w-full items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton
            icon={isMobileMenuOpen ? faXmark : faBars}
            label={isMobileMenuOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden"
          />

              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo size={40} bordered className="rounded-xl" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base font-bold tracking-tight text-slate-900">
                      TechspireCollege
                    </span>
                    <span className="hidden rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 sm:inline">
                      Enterprise
                    </span>
                  </div>
                  <p className="hidden max-w-[18rem] truncate text-sm text-slate-500 md:block">
                    {language === "ne" ? currentTenant.nameNe : currentTenant.name}
                  </p>
                </div>
              </div>
        </div>

        <div className="hidden flex-1 items-center justify-center lg:flex">
          <div className="relative w-full max-w-md">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search CollegeOS records"
              placeholder={
                language === "ne"
                  ? "विद्यार्थी, विषय वा अभिलेख खोज्नुहोस्..."
                  : "Search student, course or record..."
              }
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="cos-input bg-slate-50 pl-11"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 xl:flex">
            <FontAwesomeIcon
              icon={faCalendarDays}
              className="text-base text-slate-400"
              aria-hidden="true"
            />
            <span className="font-semibold text-slate-800">
              {calendarType === "BS" ? currentNepalTime.bs : currentNepalTime.ad}
            </span>
            <span className="text-slate-500">
              {calendarType === "BS" ? currentNepalTime.timeNe : currentNepalTime.time}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "ne" : "en")}
            aria-label={`Switch interface language. Current language: ${language === "en" ? "English" : "नेपाली"}`}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <FontAwesomeIcon
              icon={faGlobe}
              className="text-base text-slate-400"
              aria-hidden="true"
            />
            <span>{language === "en" ? "नेपाली" : "English"}</span>
          </button>

          {switchableRoles.length > 1 ? (
            <div className="relative" ref={roleMenuRef}>
              <button
                type="button"
                onClick={() => setShowRoleMenu((previous) => !previous)}
                aria-expanded={showRoleMenu}
                aria-haspopup="menu"
                className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
              >
                <FontAwesomeIcon
                  icon={faShieldHalved}
                  className="text-base text-[var(--color-primary)]"
                  aria-hidden="true"
                />
                <span className="hidden lg:inline">
                  {ROLE_LABELS[currentRole] || "Active role"}
                </span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className="text-xs text-slate-400"
                  aria-hidden="true"
                />
              </button>

              {showRoleMenu && (
                <div
                  role="menu"
                  aria-label="Active role"
                  className="absolute right-0 z-[160] mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                  <p className="px-3 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Active role
                  </p>
                  {switchableRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      role="menuitemradio"
                      aria-checked={role === currentRole}
                      onClick={() => {
                        setCurrentRole(role);
                        setShowRoleMenu(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                        role === currentRole
                          ? "bg-[var(--color-primary-soft)] font-semibold text-[var(--color-primary-strong)]"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {ROLE_LABELS[role] || role.replace(/_/g, " ")}
                      {role === currentRole && (
                        <FontAwesomeIcon
                          icon={faCheck}
                          className="text-xs text-[var(--color-primary)]"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="hidden h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 lg:flex">
              <FontAwesomeIcon
                icon={faShieldHalved}
                className="text-base text-[var(--color-primary)]"
                aria-hidden="true"
              />
              <span>{ROLE_LABELS[currentRole] || "Active role"}</span>
            </div>
          )}

          <div className="relative" ref={notificationsRef}>
            <IconButton
              icon={faBell}
              label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
              variant="secondary"
              aria-expanded={showNotifs}
              onClick={() => {
                setShowNotifs((previous) => {
                  if (!previous) void loadUnreadCount();
                  return !previous;
                });
              }}
              className="relative"
            />
            {unreadCount > 0 && (
              <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-xs font-bold text-white">
                {unreadCount}
              </span>
            )}

            {showNotifs && (
              <NotificationCenter
                open={showNotifs}
                onClose={() => setShowNotifs(false)}
                onUnreadChange={setUnreadCount}
              />
            )}
          </div>

          <IconButton
            icon={faRightFromBracket}
            label="Sign out of CollegeOS"
            variant="danger"
            onClick={() => {
              void logout();
            }}
          />
        </div>
      </div>
      <span className="sr-only">
        Institution timezone: {timeZone}
      </span>
    </header>
  );
};

export default Navbar;
