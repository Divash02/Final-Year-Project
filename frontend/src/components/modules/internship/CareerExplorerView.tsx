import React, { useState, useEffect } from "react";
import { useCollegeOS } from "../../../context/CollegeOSContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faFilter,
  faHeart,
  faBookmark,
  faCompass,
  faArrowRight,
  faChevronRight,
  faChevronLeft,
  faBriefcase,
  faCode,
  faPaintBrush,
  faDatabase,
  faNetworkWired,
  faBug,
  faServer,
  faCloud,
  faBrain,
  faChartLine,
  faProjectDiagram,
  faSitemap,
  faFileAlt,
  faShieldAlt,
  faMobileAlt,
  faMicrochip,
  faUsers,
  faUserTie,
  faGraduationCap,
  faStar,
  faEye,
  faPlus,
  faMinus,
  faExchangeAlt,
  faClipboardList,
  faTools,
  faRoad,
  faMapSigns,
  faLayerGroup,
  faMagic,
} from "@fortawesome/free-solid-svg-icons";
import {
  CareerCategory,
  CareerRole,
  CareerExplorerDashboard,
  StudentCareerInterest,
} from "../types";
import { apiRequest } from "../../../services/apiClient";
import { StatusBadge, ModalWrapper, DrawerWrapper } from "./components/SharedWidgets";

const CAREER_PATH_ICONS: Record<string, any> = {
  frontend_developer: faCode,
  backend_developer: faServer,
  fullstack_developer: faCode,
  uiux_designer: faPaintBrush,
  database_engineer: faDatabase,
  network_engineer: faNetworkWired,
  qa_engineer: faBug,
  devops_engineer: faServer,
  cloud_engineer: faCloud,
  ai_ml_engineer: faBrain,
  data_engineer: faChartLine,
  project_manager: faProjectDiagram,
  business_analyst: faSitemap,
  product_manager: faBriefcase,
  technical_writer: faFileAlt,
  systems_analyst: faSitemap,
  it_support_engineer: faTools,
  security_engineer: faShieldAlt,
  mobile_developer: faMobileAlt,
  embedded_engineer: faMicrochip,
};

const CAREER_PATH_LABELS: Record<string, string> = {
  frontend_developer: "Frontend Developer",
  backend_developer: "Backend Developer",
  fullstack_developer: "Full Stack Developer",
  uiux_designer: "UI/UX Designer",
  database_engineer: "Database Engineer",
  network_engineer: "Network Engineer",
  qa_engineer: "QA Engineer",
  devops_engineer: "DevOps Engineer",
  cloud_engineer: "Cloud Engineer",
  ai_ml_engineer: "AI/ML Engineer",
  data_engineer: "Data Engineer",
  project_manager: "Project Manager",
  business_analyst: "Business Analyst",
  product_manager: "Product Manager",
  technical_writer: "Technical Writer",
  systems_analyst: "Systems Analyst",
  it_support_engineer: "IT Support Engineer",
  security_engineer: "Security Engineer",
  mobile_developer: "Mobile Developer",
  embedded_engineer: "Embedded Engineer",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  INTERMEDIATE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  ADVANCED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  EXPERT: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
};

const INTEREST_LEVEL_LABELS: Record<string, string> = {
  EXPLORING: "Exploring",
  INTERESTED: "Interested",
  COMMITTED: "Committed",
  PRACTICING: "Practicing",
};

const INTEREST_LEVEL_COLORS: Record<string, string> = {
  EXPLORING: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  INTERESTED: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  COMMITTED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  PRACTICING: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
};

interface CareerExplorerViewProps {
  onNavigate?: (path: string) => void;
}

export const CareerExplorerView: React.FC<CareerExplorerViewProps> = ({ onNavigate }) => {
  const { currentUser } = useCollegeOS();
  const [dashboard, setDashboard] = useState<CareerExplorerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<"explore" | "my-interests" | "compare" | "roadmap">("explore");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);
  const [selectedRolesForCompare, setSelectedRolesForCompare] = useState<CareerRole[]>([]);
  const [roleDetailDrawer, setRoleDetailDrawer] = useState<CareerRole | null>(null);
  const [compareModal, setCompareModal] = useState(false);

  // Fetch dashboard data
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const dashboardData = await apiRequest<{ dashboard: CareerExplorerDashboard }>("/api/careers/dashboard");
        setDashboard(dashboardData.dashboard);
      } catch (err: any) {
        setError(err.response?.data?.error || "Failed to load career explorer");
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  // Fetch role detail
  const fetchRoleDetail = async (roleId: string) => {
    try {
      const roleData = await apiRequest<{ role: CareerRole }>(`/api/careers/roles/${roleId}`);
      setRoleDetailDrawer(roleData.role);
    } catch (err) {
      console.error("Failed to fetch role detail:", err);
    }
  };

  // Add/remove career interest
  const toggleCareerInterest = async (role: CareerRole, interest: StudentCareerInterest | null) => {
    if (!currentUser) return;

    try {
      if (interest) {
        // Update existing interest
        await apiRequest(`/api/careers/interests/${interest.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interestLevel: getNextInterestLevel(interest.interestLevel) }),
        });
      } else {
        // Add new interest
        await apiRequest("/api/careers/interests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ careerRole: role.id, interestLevel: "EXPLORING" }),
        });
      }
      // Refresh dashboard
      const dashboardData = await apiRequest<{ dashboard: CareerExplorerDashboard }>("/api/careers/dashboard");
      setDashboard(dashboardData.dashboard);
    } catch (err) {
      console.error("Failed to update career interest:", err);
    }
  };

  const getNextInterestLevel = (current: string): string => {
    const levels = ["EXPLORING", "INTERESTED", "COMMITTED", "PRACTICING"];
    const currentIndex = levels.indexOf(current);
    return levels[(currentIndex + 1) % levels.length];
  };

  // Record exploration activity
  const recordActivity = async (roleId: string, activityType: string) => {
    try {
      await apiRequest("/api/careers/exploration/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careerRole: roleId, activityType }),
      });
    } catch (err) {
      console.error("Failed to record activity:", err);
    }
  };

  // Filter roles
  const filteredRoles = dashboard?.featuredRoles.filter((role) => {
    if (selectedCategory && role.category?.code !== selectedCategory) return false;
    if (searchQuery && !role.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !role.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (difficultyFilter && role.difficulty !== difficultyFilter) return false;
    return true;
  }) || [];

  const categories = dashboard?.categories || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-3 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <FontAwesomeIcon icon={faExclamationTriangle} className="text-4xl text-amber-500 mb-4" />
        <p className="text-slate-600 dark:text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
            <FontAwesomeIcon icon={faCompass} className="text-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Career Explorer</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Discover IT career paths, explore roles, and build your professional journey
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {[
            { id: "explore", label: "Explore Careers", icon: faSearch },
            { id: "my-interests", label: "My Interests", icon: faHeart },
            { id: "compare", label: "Compare Roles", icon: faExchangeAlt },
            { id: "roadmap", label: "Career Roadmap", icon: faRoad },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <FontAwesomeIcon icon={tab.icon} className="text-lg" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "explore" && (
        <CareerExploreTab
          categories={categories}
          roles={filteredRoles}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          difficultyFilter={difficultyFilter}
          onDifficultyChange={setDifficultyFilter}
          onRoleClick={(role) => { fetchRoleDetail(role.id); recordActivity(role.id, "VIEWED_ROLE"); }}
          onInterestToggle={toggleCareerInterest}
          myInterests={dashboard?.myInterests || []}
        />
      )}

      {activeTab === "my-interests" && (
        <MyInterestsTab
          interests={dashboard?.myInterests || []}
          recentActivity={dashboard?.recentActivity || []}
          onInterestUpdate={(interest, newLevel) => {
            apiRequest(`/api/careers/interests/${interest.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ interestLevel: newLevel }),
            }).then(async () => {
              const dashboardData = await apiRequest<{ dashboard: CareerExplorerDashboard }>("/api/careers/dashboard");
              setDashboard(dashboardData.dashboard);
            });
          }}
          onRemoveInterest={(interestId) => {
            apiRequest(`/api/careers/interests/${interestId}`, {
              method: "DELETE",
            }).then(async () => {
              const dashboardData = await apiRequest<{ dashboard: CareerExplorerDashboard }>("/api/careers/dashboard");
              setDashboard(dashboardData.dashboard);
            });
          }}
        />
      )}

      {activeTab === "compare" && (
        <CompareRolesTab
          roles={dashboard?.featuredRoles || []}
          selectedRoles={selectedRolesForCompare}
          onSelectionChange={setSelectedRolesForCompare}
          onCompare={() => setCompareModal(true)}
        />
      )}

      {activeTab === "roadmap" && (
        <CareerRoadmapTab
          interests={dashboard?.myInterests || []}
          categories={categories}
        />
      )}

      {/* Role Detail Drawer */}
      <DrawerWrapper
        isOpen={!!roleDetailDrawer}
        onClose={() => setRoleDetailDrawer(null)}
        title={roleDetailDrawer?.name || "Career Role"}
        position="right"
        size="lg"
      >
        {roleDetailDrawer && (
          <RoleDetailDrawer
            role={roleDetailDrawer}
            myInterest={dashboard?.myInterests.find((i) => i.careerRole.id === roleDetailDrawer.id) || null}
            onInterestToggle={(role, interest) => toggleCareerInterest(role, interest)}
            onClose={() => setRoleDetailDrawer(null)}
            onSimulationClick={() => {
              setRoleDetailDrawer(null);
              onNavigate?.("/internships/virtual-workplace");
            }}
          />
        )}
      </DrawerWrapper>

      {/* Compare Modal */}
      <ModalWrapper
        isOpen={compareModal}
        onClose={() => setCompareModal(false)}
        title="Compare Career Roles"
        size="xl"
      >
        {selectedRolesForCompare.length >= 2 && (
          <CompareRolesModal
            roles={selectedRolesForCompare}
            onClose={() => setCompareModal(false)}
          />
        )}
        {selectedRolesForCompare.length < 2 && (
          <div className="text-center py-12">
            <FontAwesomeIcon icon={faExchangeAlt} className="text-4xl text-slate-300 mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Select at least 2 roles to compare</p>
          </div>
        )}
      </ModalWrapper>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const CareerExploreTab: React.FC<{
  categories: CareerCategory[];
  roles: CareerRole[];
  selectedCategory: string | null;
  onCategoryChange: (cat: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  difficultyFilter: string | null;
  onDifficultyChange: (d: string | null) => void;
  onRoleClick: (role: CareerRole) => void;
  onInterestToggle: (role: CareerRole, interest: StudentCareerInterest | null) => void;
  myInterests: StudentCareerInterest[];
}> = ({
  categories,
  roles,
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  difficultyFilter,
  onDifficultyChange,
  onRoleClick,
  onInterestToggle,
  myInterests,
}) => {
  const getInterest = (roleId: string) => myInterests.find((i) => i.careerRole.id === roleId) || null;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[250px]">
            <label className="sr-only">Search careers</label>
            <div className="relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search roles, skills, technologies..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:block">
              <span className="text-xs font-medium text-slate-500 mr-2">Categories:</span>
              <div className="flex items-center space-x-1 bg-slate-50 dark:bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => onCategoryChange(null)}
                  className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                    !selectedCategory
                      ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.code}
                    onClick={() => onCategoryChange(cat.code)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                      selectedCategory === cat.code
                        ? "bg-white dark:bg-slate-700 text-indigo-600 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                    style={{ borderLeftColor: `var(--color-${cat.color}-500)` }}
                  >
                    <FontAwesomeIcon icon={cat.icon as any} className="mr-1" />
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            <select
              value={difficultyFilter || ""}
              onChange={(e) => onDifficultyChange(e.target.value || null)}
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="">All Difficulties</option>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
              <option value="EXPERT">Expert</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Showing <strong>{roles.length}</strong> career roles
        </p>
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {roles.map((role) => (
          <CareerRoleCard
            key={role.id}
            role={role}
            interest={getInterest(role.id)}
            onClick={() => onRoleClick(role)}
            onInterestToggle={() => onInterestToggle(role, getInterest(role.id))}
          />
        ))}

        {roles.length === 0 && (
          <div className="col-span-full text-center py-12">
            <FontAwesomeIcon icon={faSearch} className="text-4xl text-slate-300 mb-4" />
            <p className="text-slate-600 dark:text-slate-400">No roles match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
};

const CareerRoleCard: React.FC<{
  role: CareerRole;
  interest: StudentCareerInterest | null;
  onClick: () => void;
  onInterestToggle: () => void;
}> = ({ role, interest, onClick, onInterestToggle }) => {
  const Icon = CAREER_PATH_ICONS[role.code] || faCode;
  const categoryColor = role.category?.color || "indigo";

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 cursor-pointer hover:border-indigo-500/50 hover:shadow-lg transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
          <FontAwesomeIcon icon={Icon} className="text-xl" />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onInterestToggle(); }}
          className={`p-2 rounded-lg transition-all ${
            interest ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-600" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-red-500"
          }`}
          aria-label={interest ? "Update interest level" : "Add to interests"}
        >
          <FontAwesomeIcon icon={interest ? faHeart : faBookmark} className={interest ? "fill-current" : ""} />
        </button>
      </div>

      <h3 className="font-bold text-slate-900 dark:text-white mb-1">{role.name}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{role.description}</p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {role.requiredTechnicalSkills.slice(0, 4).map((skill) => (
          <span key={skill.skill} className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
            {skill.skill}
          </span>
        ))}
        {role.requiredTechnicalSkills.length > 4 && (
          <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
            +{role.requiredTechnicalSkills.length - 4} more
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[role.difficulty]}`}>
          {role.difficulty}
        </span>
        {interest && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${INTEREST_LEVEL_COLORS[interest.interestLevel]}`}>
            {INTEREST_LEVEL_LABELS[interest.interestLevel]}
          </span>
        )}
      </div>
    </div>
  );
};

const MyInterestsTab: React.FC<{
  interests: StudentCareerInterest[];
  recentActivity: any[];
  onInterestUpdate: (interest: StudentCareerInterest, newLevel: string) => void;
  onRemoveInterest: (interestId: string) => void;
}> = ({ interests, recentActivity, onInterestUpdate, onRemoveInterest }) => {
  if (interests.length === 0) {
    return (
      <div className="text-center py-16">
        <FontAwesomeIcon icon={faHeart} className="text-5xl text-slate-300 mb-4" />
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No Career Interests Yet</h3>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Explore careers and add ones that interest you to track your journey</p>
        <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow">
          <FontAwesomeIcon icon={faSearch} className="mr-2" />
          Explore Careers
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* My Interests */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center">
          <FontAwesomeIcon icon={faHeart} className="text-indigo-600 mr-2" />
          My Career Interests ({interests.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {interests.map((interest) => (
            <InterestCard
              key={interest.id}
              interest={interest}
              onUpdate={(newLevel) => onInterestUpdate(interest, newLevel)}
              onRemove={() => onRemoveInterest(interest.id)}
            />
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center">
            <FontAwesomeIcon icon={faClock} className="text-indigo-600 mr-2" />
            Recent Exploration Activity
          </h3>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {recentActivity.slice(0, 10).map((activity, index) => (
              <div key={index} className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600">
                    <FontAwesomeIcon icon={faEye} className="text-lg" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{activity.careerRole?.name || "Career Role"}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{activity.activityType.replace(/_/g, " ").toLowerCase()}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{new Date(activity.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const InterestCard: React.FC<{
  interest: StudentCareerInterest;
  onUpdate: (newLevel: string) => void;
  onRemove: () => void;
}> = ({ interest, onUpdate, onRemove }) => {
  const role = interest.careerRole;
  const Icon = CAREER_PATH_ICONS[role.code] || faCode;
  const levels = ["EXPLORING", "INTERESTED", "COMMITTED", "PRACTICING"];
  const currentIndex = levels.indexOf(interest.interestLevel);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600">
            <FontAwesomeIcon icon={Icon} className="text-xl" />
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white">{role.name}</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">{role.category?.name || "IT"}</p>
          </div>
        </div>
        <button onClick={onRemove} className="p-1 text-slate-400 hover:text-red-500">
          <FontAwesomeIcon icon={faTimes} className="text-lg" />
        </button>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-slate-500 mb-1">Interest Level</label>
        <div className="flex space-x-1">
          {levels.map((level) => (
            <button
              key={level}
              onClick={() => onUpdate(level)}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-all ${
                levels.indexOf(level) <= currentIndex
                  ? INTEREST_LEVEL_COLORS[level]
                  : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              {INTEREST_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[role.difficulty]}`}>
          {role.difficulty}
        </span>
        <span className="text-xs text-slate-500">Since {new Date(interest.startedAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

const CompareRolesTab: React.FC<{
  roles: CareerRole[];
  selectedRoles: CareerRole[];
  onSelectionChange: (roles: CareerRole[]) => void;
  onCompare: () => void;
}> = ({ roles, selectedRoles, onSelectionChange, onCompare }) => {
  const toggleRole = (role: CareerRole) => {
    const isSelected = selectedRoles.some((r) => r.id === role.id);
    if (isSelected) {
      onSelectionChange(selectedRoles.filter((r) => r.id !== role.id));
    } else if (selectedRoles.length < 5) {
      onSelectionChange([...selectedRoles, role]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selected Roles Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-900 dark:text-white">Selected for Comparison ({selectedRoles.length}/5)</h3>
          <button
            onClick={onCompare}
            disabled={selectedRoles.length < 2}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-sm"
          >
            <FontAwesomeIcon icon={faExchangeAlt} className="mr-2" />
            Compare
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedRoles.map((role) => (
            <span key={role.id} className="flex items-center space-x-1 px-3 py-1 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full text-sm">
              {role.name}
              <button onClick={() => toggleRole(role)} className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-100">
                <FontAwesomeIcon icon={faTimes} className="text-xs" />
              </button>
            </span>
          ))}
          {selectedRoles.length === 0 && (
            <span className="text-slate-500 text-sm">No roles selected. Click roles below to add them.</span>
          )}
        </div>
      </div>

      {/* Role Selection Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((role) => {
          const isSelected = selectedRoles.some((r) => r.id === role.id);
          const Icon = CAREER_PATH_ICONS[role.code] || faCode;
          return (
            <div
              key={role.id}
              onClick={() => toggleRole(role)}
              className={`bg-white dark:bg-slate-900 border-2 rounded-xl p-5 cursor-pointer transition-all ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 shadow-lg"
                  : "border-slate-200 dark:border-slate-800 hover:border-indigo-300"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-3 rounded-xl ${isSelected ? "bg-indigo-500 text-white" : "bg-indigo-100 dark:bg-indigo-950 text-indigo-600"}`}>
                  <FontAwesomeIcon icon={Icon} className="text-xl" />
                </div>
                {isSelected && (
                  <FontAwesomeIcon icon={faCheckCircle} className="text-indigo-500 text-xl" />
                )}
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white">{role.name}</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{role.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[role.difficulty]}`}>
                  {role.difficulty}
                </span>
                <span className="text-xs text-slate-500">{role.requiredTechnicalSkills.length} core skills</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CareerRoadmapTab: React.FC<{
  interests: StudentCareerInterest[];
  categories: CareerCategory[];
}> = ({ interests, categories }) => {
  if (interests.length === 0) {
    return (
      <div className="text-center py-16">
        <FontAwesomeIcon icon={faRoad} className="text-5xl text-slate-300 mb-4" />
        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Start Your Career Journey</h3>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Add career interests to see your personalized roadmap with skill progression and learning paths</p>
        <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow">
          <FontAwesomeIcon icon={faSearch} className="mr-2" />
          Explore Careers
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {interests.map((interest) => {
        const role = interest.careerRole;
        return (
          <div key={interest.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600">
                  <FontAwesomeIcon icon={CAREER_PATH_ICONS[role.code] || faCode} className="text-2xl" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{role.name}</h3>
                  <p className="text-sm text-slate-500">Interest: {INTEREST_LEVEL_LABELS[interest.interestLevel]}</p>
                </div>
              </div>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${DIFFICULTY_COLORS[role.difficulty]}`}>
                {role.difficulty}
              </span>
            </div>
            <div className="p-5">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-4">Career Progression</h4>
              <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                {role.careerProgression.map((level, index) => (
                  <div key={level.level} className="relative pb-8 last:pb-0">
                    <div className="absolute left-[-10px] top-0 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white dark:border-slate-900" />
                    <div className="ml-4">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-bold text-slate-900 dark:text-white">{level.title}</span>
                        <span className="text-xs text-slate-500">~{level.typicalExperienceYears} years</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 ml-6">
                        {level.keyResponsibilities.slice(0, 3).join(" · ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RoleDetailDrawer: React.FC<{
  role: CareerRole;
  myInterest: StudentCareerInterest | null;
  onInterestToggle: (role: CareerRole, interest: StudentCareerInterest | null) => void;
  onClose: () => void;
  onSimulationClick: () => void;
}> = ({ role, myInterest, onInterestToggle, onClose, onSimulationClick }) => {
  const [activeSection, setActiveSection] = useState<"overview" | "skills" | "tools" | "projects" | "progression" | "evidence">("overview");

  const sections = [
    { id: "overview", label: "Overview", icon: faBriefcase },
    { id: "skills", label: "Skills", icon: faCode },
    { id: "tools", label: "Tools", icon: faTools },
    { id: "projects", label: "Projects", icon: faProjectDiagram },
    { id: "progression", label: "Progression", icon: faRoad },
    { id: "evidence", label: "Portfolio Evidence", icon: faClipboardList },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-4 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600">
            <FontAwesomeIcon icon={CAREER_PATH_ICONS[role.code] || faCode} className="text-3xl" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{role.name}</h2>
            <p className="text-sm text-slate-500">{role.category?.name || "IT"} • {role.industry}</p>
            <div className="flex items-center space-x-2 mt-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[role.difficulty]}`}>
                {role.difficulty}
              </span>
              {myInterest && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${INTEREST_LEVEL_COLORS[myInterest.interestLevel]}`}>
                  {INTEREST_LEVEL_LABELS[myInterest.interestLevel]}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-1 overflow-x-auto pb-1" aria-label="Career role sections">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as any)}
              className={`flex items-center space-x-1 px-4 py-2 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
                activeSection === section.id
                  ? "text-indigo-600 border-b-2 border-indigo-600"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <FontAwesomeIcon icon={section.icon} className="text-lg" />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Section Content */}
      <div className="max-h-[60vh] overflow-y-auto pr-2">
        {activeSection === "overview" && (
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Description</h4>
              <p className="text-slate-600 dark:text-slate-400">{role.description}</p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Key Responsibilities</h4>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
                {role.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Related Job Titles</h4>
              <div className="flex flex-wrap gap-2">
                {role.relatedJobTitles.map((title, i) => (
                  <span key={i} className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full">
                    {title}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeSection === "skills" && (
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Required Technical Skills</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {role.requiredTechnicalSkills.map((skill) => (
                  <div key={skill.skill} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-900 dark:text-white">{skill.skill}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        skill.proficiency === "EXPERT" ? "bg-rose-100 text-rose-800" :
                        skill.proficiency === "ADVANCED" ? "bg-amber-100 text-amber-800" :
                        skill.proficiency === "INTERMEDIATE" ? "bg-blue-100 text-blue-800" :
                        "bg-emerald-100 text-emerald-800"
                      }`}>
                        {skill.proficiency}
                      </span>
                    </div>
                    {skill.isCore && (
                      <span className="text-xs text-indigo-600 font-medium">Core Skill</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Required Soft Skills</h4>
              <div className="flex flex-wrap gap-2">
                {role.requiredSoftSkills.map((skill, i) => (
                  <span key={i} className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeSection === "tools" && (
          <div className="space-y-4">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Professional Tools</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {role.professionalTools.map((tool) => (
                <div key={tool.name} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-900 dark:text-white">{tool.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {tool.category}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-sm text-slate-500">
                    <span>Proficiency:</span>
                    <span className="font-medium">{tool.proficiency}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === "projects" && (
          <div className="space-y-4">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Example Projects</h4>
            {role.exampleProjects.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">No example projects defined.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {role.exampleProjects.map((project, i) => (
                  <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h5 className="font-semibold text-slate-900 dark:text-white mb-1">{project.title}</h5>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{project.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {project.technologies.map((tech, j) => (
                          <span key={j} className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded">
                            {tech}
                          </span>
                        ))}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        project.difficulty === "BEGINNER" ? "bg-emerald-100 text-emerald-800" :
                        project.difficulty === "INTERMEDIATE" ? "bg-blue-100 text-blue-800" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {project.difficulty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === "progression" && (
          <div className="space-y-4">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Career Progression Path</h4>
            <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700">
              {role.careerProgression.map((level, index) => (
                <div key={level.level} className="relative pb-8 last:pb-0">
                  <div className="absolute left-[-10px] top-0 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white dark:border-slate-900" />
                  <div className="ml-4">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-bold text-slate-900 dark:text-white">{level.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-600">
                        Level {index + 1}
                      </span>
                      <span className="text-xs text-slate-500">~{level.typicalExperienceYears} years</span>
                    </div>
                    <ul className="list-disc pl-6 space-y-1 text-sm text-slate-600 dark:text-slate-400">
                      {level.keyResponsibilities.map((resp, i) => <li key={i}>{resp}</li>)}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === "evidence" && (
          <div className="space-y-4">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Portfolio Evidence Requirements</h4>
            {role.portfolioEvidenceRequirements.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">No specific evidence requirements defined.</p>
            ) : (
              <div className="space-y-3">
                {role.portfolioEvidenceRequirements.map((req, i) => (
                  <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-slate-900 dark:text-white">{req.evidenceType.replace(/_/g, " ")}</span>
                      <div className="flex items-center space-x-2">
                        {req.isRequired && (
                          <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-800">Required</span>
                        )}
                        <span className="text-xs text-slate-500">Min: {req.minCount}</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{req.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex space-x-3">
          <button
            onClick={() => { onInterestToggle(role, myInterest); }}
            className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm"
          >
            {myInterest ? "Update Interest Level" : "Add to My Interests"}
          </button>
          <button
            onClick={onSimulationClick}
            className="flex-1 py-3 px-4 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FontAwesomeIcon icon={faBriefcase} className="mr-2" />
            Join Simulation
          </button>
        </div>
      </div>
    </div>
  );
};

const CompareRolesModal: React.FC<{
  roles: CareerRole[];
  onClose: () => void;
}> = ({ roles, onClose }) => {
  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto">
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <div key={role.id} className="px-4 py-2 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium">
            {role.name}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="text-left p-3 font-semibold text-slate-900 dark:text-white">Aspect</th>
              {roles.map((role) => (
                <th key={role.id} className="text-left p-3 font-semibold text-slate-900 dark:text-white">
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-3 font-medium text-slate-900 dark:text-white">Category</td>
              {roles.map((role) => (
                <td key={role.id} className="p-3 text-slate-600 dark:text-slate-400">{role.category?.name}</td>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-3 font-medium text-slate-900 dark:text-white">Difficulty</td>
              {roles.map((role) => (
                <td key={role.id} className="p-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLORS[role.difficulty]}`}>
                    {role.difficulty}
                  </span>
                </td>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-3 font-medium text-slate-900 dark:text-white">Core Skills Count</td>
              {roles.map((role) => (
                <td key={role.id} className="p-3 text-slate-600 dark:text-slate-400">{role.requiredTechnicalSkills.filter(s => s.isCore).length}</td>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-3 font-medium text-slate-900 dark:text-white">Total Skills</td>
              {roles.map((role) => (
                <td key={role.id} className="p-3 text-slate-600 dark:text-slate-400">{role.requiredTechnicalSkills.length}</td>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-3 font-medium text-slate-900 dark:text-white">Professional Tools</td>
              {roles.map((role) => (
                <td key={role.id} className="p-3 text-slate-600 dark:text-slate-400">{role.professionalTools.length}</td>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-3 font-medium text-slate-900 dark:text-white">Example Projects</td>
              {roles.map((role) => (
                <td key={role.id} className="p-3 text-slate-600 dark:text-slate-400">{role.exampleProjects.length}</td>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-3 font-medium text-slate-900 dark:text-white">Progression Levels</td>
              {roles.map((role) => (
                <td key={role.id} className="p-3 text-slate-600 dark:text-slate-400">{role.careerProgression.length}</td>
              ))}
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-3 font-medium text-slate-900 dark:text-white">Evidence Requirements</td>
              {roles.map((role) => (
                <td key={role.id} className="p-3 text-slate-600 dark:text-slate-400">{role.portfolioEvidenceRequirements.length}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-3">
        <button onClick={onClose} className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold rounded-lg">
          Close
        </button>
      </div>
    </div>
  );
};

export default CareerExplorerView;