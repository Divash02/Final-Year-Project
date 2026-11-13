import React, { useEffect, useState } from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { apiFetch } from "../../services/apiClient";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  getVisibleNavSectionsForRole,
  NavItem,
} from "../../lib/navigation";

const BADGE_TONES = {
  danger: "bg-red-500/15 text-red-200",
  warning: "bg-amber-500/15 text-amber-200",
  neutral: "bg-white/10 text-slate-200",
} as const;

type ApiStatus = "checking" | "online" | "offline";

export const Sidebar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    currentRole,
    currentTenant,
    currentUser,
    language,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
  } = useCollegeOS();

  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    let active = true;
    apiFetch("/health")
      .then((response) => {
        if (active) setApiStatus(response.ok ? "online" : "offline");
      })
      .catch(() => {
        if (active) setApiStatus("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  const permissions = new Set(currentUser?.permissions || []);

  /**
   * Sidebar badges are computed from the institution database.
   * Only fetch counts the session user is permitted to read so
   * we avoid predictable 403 noise for roles without access.
   */
  const [badgeCounts, setBadgeCounts] = useState<
    Record<NonNullable<NavItem["badge"]>, number>
  >({ pendingRequests: 0, overdueInvoices: 0 });

  useEffect(() => {
    let active = true;
    const canReadInvoices = permissions.has("finance.invoice.view");

    const pendingRequestsPromise = apiFetch("/cases")
      .then((response) => (response.ok ? response.json() : { cases: [] }))
      .catch(() => ({ cases: [] }));
    const invoicesPromise = canReadInvoices
      ? apiFetch("/invoices")
          .then((response) => (response.ok ? response.json() : { invoices: [] }))
          .catch(() => ({ invoices: [] }))
      : Promise.resolve({ invoices: [] });

    Promise.all([pendingRequestsPromise, invoicesPromise])
      .then(([caseResult, invoiceResult]) => {
        if (!active) return;
        const cases = Array.isArray(caseResult.cases)
          ? caseResult.cases
          : [];
        const invoices = Array.isArray(invoiceResult.invoices)
          ? invoiceResult.invoices
          : [];
        setBadgeCounts({
          pendingRequests: cases.filter(
            (request: { status: string }) =>
              request.status === "SUBMITTED" ||
              request.status === "IN_REVIEW",
          ).length,
          overdueInvoices: invoices.filter(
            (invoice: { status: string }) =>
              invoice.status === "OVERDUE",
          ).length,
        });
      })
      .catch(() => {
        if (active) {
          setBadgeCounts({ pendingRequests: 0, overdueInvoices: 0 });
        }
      });
    return () => {
      active = false;
    };
  }, [currentUser?.id, permissions.has("finance.invoice.view")]);

  /**
   * Items are filtered against the session user's granted
   * permissions and sections left empty are dropped, so every
   * rendered heading owns at least one accessible page.
   * Hiding an entry here is a convenience only â€” the backend
   * re-authorizes every request server-side.
   */
  const sections = getVisibleNavSectionsForRole(currentRole, permissions);

  const activeSectionId = sections.find((section) =>
    section.items.some((item) => item.id === activeView),
  )?.id;

  const [collapsedSections, setCollapsedSections] = useState<
    ReadonlySet<string>
  >(new Set());

  // The section containing the active route stays expanded, including
  // on direct navigation and page refresh.
  useEffect(() => {
    if (!activeSectionId) return;
    setCollapsedSections((previous) => {
      if (!previous.has(activeSectionId)) return previous;
      const next = new Set(previous);
      next.delete(activeSectionId);
      return next;
    });
  }, [activeSectionId]);

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const statusLabel =
    apiStatus === "online"
      ? "TechspireCollege connected"
      : apiStatus === "checking"
        ? "Checking connection"
        : "API unreachable";

  return (
    <>
      {isMobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-[150] cursor-default bg-slate-950/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed left-0 top-16 z-[170] flex h-[calc(100vh-4rem)] w-[280px] max-w-[85%] shrink-0 flex-col overflow-x-hidden overflow-y-auto overscroll-contain border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:z-[140] lg:h-full lg:max-w-none lg:translate-x-0 ${
          isMobileMenuOpen
            ? "translate-x-0 shadow-2xl"
            : "-translate-x-full lg:translate-x-0"
        }`}
        aria-label="Main navigation"
      >
        <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5">
          {sections.map((section) => {
            const isCollapsed = collapsedSections.has(section.id);
            const sectionTitle =
              language === "ne" ? section.titleNe : section.titleEn;

            return (
              <div key={section.id} className="mb-5 last:mb-0">
                <button
                  type="button"
                  id={`nav-section-heading-${section.id}`}
                  className="cos-nav-section-toggle"
                  aria-expanded={!isCollapsed}
                  aria-controls={`nav-section-items-${section.id}`}
                  onClick={() => toggleSection(section.id)}
                  title={sectionTitle}
                >
                  <span className="cos-nav-section-title">{sectionTitle}</span>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className={`cos-nav-section-chevron${
                      isCollapsed ? " cos-nav-section-chevron-collapsed" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <ul
                  id={`nav-section-items-${section.id}`}
                  className="space-y-1"
                  role="group"
                  aria-labelledby={`nav-section-heading-${section.id}`}
                  hidden={isCollapsed}
                >
                  {section.items.map((item) => {
                    const isActive = activeView === item.id;
                    const badgeCount = item.badge
                      ? badgeCounts[item.badge]
                      : undefined;
                    const label =
                      language === "ne" ? item.labelNe : item.labelEn;

                    return (
                      <li key={item.id}>
                          <button
                            type="button"
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => {
                              setActiveView(item.id);
                              setIsMobileMenuOpen(false);
                            }}
                            className={`cos-nav-item ${
                              isActive
                                ? "bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] font-semibold rounded-full shadow-sm"
                                : ""
                            }`}
                        >
                          <FontAwesomeIcon
                            icon={item.icon}
                            className="w-[1.125rem] shrink-0 text-center text-base"
                            aria-hidden="true"
                          />
                          <span
                            className="min-w-0 flex-1 truncate"
                            title={label}
                          >
                            {label}
                          </span>
                          {badgeCount !== undefined && badgeCount > 0 && (
                            <span
                              className={`min-w-5 shrink-0 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold ${
                                isActive
                                  ? "bg-white/20 text-white"
                                  : BADGE_TONES[item.badgeTone || "neutral"]
                              }`}
                            >
                              {badgeCount}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-soft)] px-5 py-3">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  apiStatus === "online"
                    ? "bg-emerald-400"
                    : apiStatus === "checking"
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{statusLabel}</span>
            </span>
            <span className="shrink-0 text-[var(--color-sidebar-text-muted)]">
              {currentTenant.config.timezone.replace("Asia/", "")}
            </span>
          </div>
          {apiStatus === "offline" && (
            <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-snug text-amber-300">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>Records may be stale. Restart the API to resume.</span>
            </p>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
