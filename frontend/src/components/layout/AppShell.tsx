import React from "react";
import { useCollegeOS } from "../../context/CollegeOSContext";
import { Navbar } from "../common/Navbar";
import { Sidebar } from "../common/Sidebar";

export interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Global application frame: top bar, the role-aware 250px sidebar and the main
 * canvas. Every authenticated screen renders inside this shell so navigation,
 * spacing and scrolling behave identically everywhere.
 *
 * The frame is a fixed `h-screen w-full overflow-hidden` box: the sidebar owns
 * its own vertical scroll and `<main>` is the only scrolling region, so the page
 * itself never scrolls horizontally.
 */
export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { isMobileMenuOpen, setIsMobileMenuOpen } = useCollegeOS();

  return (
    <div className="flex h-screen w-full max-h-screen flex-col overflow-hidden bg-[var(--color-background)] font-sans text-[var(--color-text-primary)]">
      <Navbar />

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <Sidebar />

        <main
          id="collegeos-main"
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-[var(--color-background)]"
          onKeyDown={(event) => {
            if (event.key === "Escape" && isMobileMenuOpen) {
              setIsMobileMenuOpen(false);
            }
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;