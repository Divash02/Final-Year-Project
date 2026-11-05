import React, { useEffect, useState } from "react";
import { apiRequest } from "../../../services/apiClient";
import { useCollegeOS } from "../../../context/CollegeOSContext";

const tabs = [
  "dashboard",
  "buildings",
  "labs",
  "reservations",
  "maintenance",
  "assets",
  "transport",
] as const;

type TabKey = (typeof tabs)[number];
const tabView: Record<TabKey, string> = {
  dashboard: "campus_facilities_ext",
  buildings: "campus_buildings",
  labs: "campus_labs",
  reservations: "campus_reservations",
  maintenance: "campus_maintenance",
  assets: "campus_assets",
  transport: "campus_transport",
};
const viewTab = Object.fromEntries(
  Object.entries(tabView).map(([tab, view]) => [view, tab]),
) as Record<string, TabKey>;
const pageDetails: Record<TabKey, { title: string; description: string }> = {
  dashboard: {
    title: "Campus & Facilities Dashboard",
    description: "Live operational overview of buildings, rooms, reservations, maintenance, assets, and transport.",
  },
  buildings: {
    title: "Buildings & Classrooms",
    description: "Manage campus buildings, room inventory, classrooms, capacity, and facilities.",
  },
  labs: {
    title: "Laboratories & Equipment",
    description: "Manage laboratory locations, ownership, capacity, and operating status.",
  },
  reservations: {
    title: "Room Reservations",
    description: "Submit and review room booking requests and reservation schedules.",
  },
  maintenance: {
    title: "Maintenance Management",
    description: "Track reported issues, priorities, and work-order progress.",
  },
  assets: {
    title: "Assets & Inventory",
    description: "Register institutional assets and review current inventory status.",
  },
  transport: {
    title: "Transport Management",
    description: "Manage institutional vehicles, routes, and assigned drivers.",
  },
};
type Building = {
  _id?: string;
  id?: string;
  name: string;
  code?: string;
  campus?: string;
  floors?: number;
  roomCount?: number;
  status?: string;
};
type Room = {
  _id?: string;
  name: string;
  roomNumber?: string;
  roomType?: string;
  capacity?: number;
  status?: string;
  building?: string;
  buildingId?: { _id?: string; name?: string; code?: string } | string;
};
type Lab = {
  _id?: string;
  name: string;
  code?: string;
  laboratoryType?: string;
  capacity?: number;
  status?: string;
  buildingId?: { name?: string; code?: string } | string;
};
type Reservation = {
  _id?: string;
  roomId?: { name?: string; roomNumber?: string } | string;
  buildingId?: { name?: string; campus?: string } | string;
  date?: string;
  startTime?: string;
  endTime?: string;
  purpose?: string;
  department?: string;
  status?: string;
  requesterName?: string;
};
type Maintenance = {
  _id?: string;
  title: string;
  category?: string;
  priority?: string;
  status?: string;
  roomId?: { name?: string; roomNumber?: string } | string;
  buildingId?: { name?: string } | string;
};
type Asset = {
  _id?: string;
  name: string;
  tag?: string;
  status?: string;
  condition?: string;
  quantity?: number;
  availableQuantity?: number;
};
type Vehicle = {
  _id?: string;
  registrationNumber?: string;
  vehicleType?: string;
  status?: string;
  assignedDriver?: string;
};
type Route = {
  _id?: string;
  name: string;
  code?: string;
  startPoint?: string;
  destination?: string;
  status?: string;
};
type DashboardData = {
  metrics?: Record<string, number | string>;
  recentMaintenance?: Maintenance[];
  upcomingReservations?: Reservation[];
  recentAssetActivities?: Asset[];
};

const badgeClasses: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Reserved: "bg-violet-100 text-violet-700",
  Ready: "bg-teal-100 text-teal-700",
  Completed: "bg-sky-100 text-sky-700",
  Closed: "bg-slate-200 text-slate-700",
  Rejected: "bg-red-100 text-red-700",
  Cancelled: "bg-gray-200 text-gray-700",
  "Under Maintenance": "bg-red-100 text-red-700",
  Maintenance: "bg-orange-100 text-orange-700",
  Unavailable: "bg-red-100 text-red-700",
  Occupied: "bg-blue-100 text-blue-700",
  Available: "bg-emerald-100 text-emerald-700",
  default: "bg-slate-100 text-slate-700",
};

const roomStatuses = ["Available", "Occupied", "Reserved", "Maintenance", "Unavailable", "Ready"] as const;

const metricCards = [
  { key: "totalBuildings", label: "Total Buildings" },
  { key: "totalRooms", label: "Total Rooms" },
  { key: "availableRooms", label: "Available Rooms" },
  { key: "occupiedRooms", label: "Occupied Rooms" },
  { key: "activeLabs", label: "Active Laboratories" },
  { key: "pendingReservations", label: "Pending Reservations" },
  { key: "pendingMaintenance", label: "Pending Maintenance" },
  { key: "totalRegisteredAssets", label: "Registered Assets" },
  { key: "assetsUnderMaintenance", label: "Assets Under Maintenance" },
  { key: "activeVehicles", label: "Active Vehicles" },
];

const initialBuildingForm = {
  name: "",
  code: "",
  campus: "Main Campus",
  floors: "1",
  description: "",
  status: "Active",
};
const initialRoomForm = { buildingId: "", roomNumber: "", name: "", floor: "Ground", roomType: "Classroom", capacity: "40", facilities: "", status: "Available" };
const initialLabForm = { name: "", code: "", buildingId: "", roomId: "", department: "", laboratoryType: "Computer", capacity: "30", supervisor: "", status: "Active" };
const initialReservationForm = { roomId: "", buildingId: "", date: "", startTime: "09:00", endTime: "10:00", purpose: "Classroom session", department: "", requesterName: "" };
const initialMaintenanceForm = { title: "", description: "", buildingId: "", roomId: "", category: "Electrical", priority: "Medium" };
const initialAssetForm = { name: "", tag: "", category: "IT", description: "", status: "Registered", condition: "Good", department: "", quantity: "1" };
const initialVehicleForm = { registrationNumber: "", vehicleType: "Bus", makeModel: "", capacity: "20", status: "Active", assignedDriver: "" };
const initialRouteForm = { name: "", code: "", startPoint: "", destination: "", stops: "", assignedDriver: "", status: "Planned" };

function statusPill(value?: string) {
  const label = value || "Unknown";
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${badgeClasses[label] || badgeClasses.default}`}>
      {label}
    </span>
  );
}

export const CampusFacilitiesExtendedView: React.FC = () => {
  const { activeView, setActiveView } = useCollegeOS();
  const activeTab = viewTab[activeView] || "dashboard";
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingRoomStatusId, setSavingRoomStatusId] = useState<string | null>(null);

  const [buildingForm, setBuildingForm] = useState(initialBuildingForm);
  const [roomForm, setRoomForm] = useState(initialRoomForm);
  const [labForm, setLabForm] = useState(initialLabForm);
  const [reservationForm, setReservationForm] = useState(initialReservationForm);
  const [maintenanceForm, setMaintenanceForm] = useState(initialMaintenanceForm);
  const [assetForm, setAssetForm] = useState(initialAssetForm);
  const [vehicleForm, setVehicleForm] = useState(initialVehicleForm);
  const [routeForm, setRouteForm] = useState(initialRouteForm);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, buildingsData, roomsData, labsData, reservationsData, maintenanceData, assetsData, transportData] = await Promise.all([
        apiRequest<{ metrics: Record<string, number>; recentMaintenance: Maintenance[]; upcomingReservations: Reservation[]; recentAssetActivities: Asset[] }>("/facilities/dashboard"),
        apiRequest<{ buildings: Building[] }>("/facilities/buildings"),
        apiRequest<{ rooms: Room[] }>("/facilities/rooms"),
        apiRequest<{ labs: Lab[] }>("/facilities/labs"),
        apiRequest<{ reservations: Reservation[] }>("/facilities/reservations"),
        apiRequest<{ maintenance: Maintenance[] }>("/facilities/maintenance"),
        apiRequest<{ assets: Asset[] }>("/facilities/assets"),
        apiRequest<{ vehicles: Vehicle[]; routes: Route[] }>("/facilities/transport"),
      ]);

      setDashboard(dashboardData);
      setBuildings(buildingsData.buildings || []);
      setRooms(roomsData.rooms || []);
      setLabs(labsData.labs || []);
      setReservations(reservationsData.reservations || []);
      setMaintenance(maintenanceData.maintenance || []);
      setAssets(assetsData.assets || []);
      setVehicles(transportData.vehicles || []);
      setRoutes(transportData.routes || []);
    } catch (err) {
      setError((err as Error).message || "Unable to load the facilities workspace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleCreateBuilding(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/facilities/buildings", {
      method: "POST",
      body: JSON.stringify({
        name: buildingForm.name,
        code: buildingForm.code,
        campus: buildingForm.campus,
        floors: Number(buildingForm.floors || 1),
        description: buildingForm.description,
        status: buildingForm.status,
      }),
    });
    setBuildingForm(initialBuildingForm);
    await loadData();
  }

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/facilities/rooms", {
      method: "POST",
      body: JSON.stringify({
        buildingId: roomForm.buildingId,
        roomNumber: roomForm.roomNumber,
        name: roomForm.name,
        floor: roomForm.floor,
        roomType: roomForm.roomType,
        capacity: Number(roomForm.capacity || 0),
        facilities: roomForm.facilities.split(",").map((entry) => entry.trim()).filter(Boolean),
        status: roomForm.status,
      }),
    });
    setRoomForm(initialRoomForm);
    await loadData();
  }

  async function handleRoomStatusChange(roomId: string, status: string) {
    setSavingRoomStatusId(roomId);
    setError(null);
    try {
      await apiRequest(`/facilities/rooms/${roomId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (err) {
      setError((err as Error).message || "Unable to update the room status.");
    } finally {
      setSavingRoomStatusId(null);
    }
  }

  async function handleCreateLab(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/facilities/labs", {
      method: "POST",
      body: JSON.stringify({
        name: labForm.name,
        code: labForm.code,
        buildingId: labForm.buildingId,
        roomId: labForm.roomId,
        department: labForm.department,
        laboratoryType: labForm.laboratoryType,
        capacity: Number(labForm.capacity || 0),
        supervisor: labForm.supervisor,
        status: labForm.status,
        facilities: ["Projector", "Whiteboard"],
      }),
    });
    setLabForm(initialLabForm);
    await loadData();
  }

  async function handleCreateReservation(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/facilities/reservations", {
      method: "POST",
      body: JSON.stringify({
        roomId: reservationForm.roomId,
        buildingId: reservationForm.buildingId,
        date: reservationForm.date,
        startTime: reservationForm.startTime,
        endTime: reservationForm.endTime,
        purpose: reservationForm.purpose,
        department: reservationForm.department,
        requesterName: reservationForm.requesterName,
      }),
    });
    setReservationForm(initialReservationForm);
    await loadData();
  }

  async function handleCreateMaintenance(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/facilities/maintenance", {
      method: "POST",
      body: JSON.stringify({
        title: maintenanceForm.title,
        description: maintenanceForm.description,
        buildingId: maintenanceForm.buildingId,
        roomId: maintenanceForm.roomId,
        category: maintenanceForm.category,
        priority: maintenanceForm.priority,
      }),
    });
    setMaintenanceForm(initialMaintenanceForm);
    await loadData();
  }

  async function handleCreateAsset(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/facilities/assets", {
      method: "POST",
      body: JSON.stringify({
        name: assetForm.name,
        tag: assetForm.tag,
        category: assetForm.category,
        description: assetForm.description,
        status: assetForm.status,
        condition: assetForm.condition,
        department: assetForm.department,
        quantity: Number(assetForm.quantity || 1),
      }),
    });
    setAssetForm(initialAssetForm);
    await loadData();
  }

  async function handleCreateVehicle(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/facilities/transport/vehicles", {
      method: "POST",
      body: JSON.stringify({
        registrationNumber: vehicleForm.registrationNumber,
        vehicleType: vehicleForm.vehicleType,
        makeModel: vehicleForm.makeModel,
        capacity: Number(vehicleForm.capacity || 0),
        status: vehicleForm.status,
        assignedDriver: vehicleForm.assignedDriver,
      }),
    });
    setVehicleForm(initialVehicleForm);
    await loadData();
  }

  async function handleCreateRoute(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest("/facilities/transport/routes", {
      method: "POST",
      body: JSON.stringify({
        name: routeForm.name,
        code: routeForm.code,
        startPoint: routeForm.startPoint,
        destination: routeForm.destination,
        stops: routeForm.stops.split(",").map((value) => value.trim()).filter(Boolean),
        assignedDriver: routeForm.assignedDriver,
        status: routeForm.status,
      }),
    });
    setRouteForm(initialRouteForm);
    await loadData();
  }

  const metrics = dashboard?.metrics || {};

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Campus & Facilities</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">{pageDetails[activeTab].title}</h1>
            <p className="mt-1 text-sm text-slate-600">{pageDetails[activeTab].description}</p>
          </div>
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            {loading ? "Refreshing live records..." : "Connected to institutional data"}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {metricCards.map((metric) => (
            <div key={metric.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">{metric.label}</p>
              <p className="mt-3 text-2xl font-bold text-slate-900">{Number(metrics[metric.key] ?? 0)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveView(tabView[tab])}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === tab ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "dashboard" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Recent maintenance requests</h2>
              <div className="mt-4 space-y-3">
                {(dashboard?.recentMaintenance || []).length === 0 && <p className="text-sm text-slate-500">No maintenance records found.</p>}
                {(dashboard?.recentMaintenance || []).slice(0, 5).map((item) => (
                  <div key={String(item._id)} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                    <div>
                      <p className="font-medium text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.category} · {item.priority}</p>
                    </div>
                    {statusPill(item.status)}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Upcoming reservations</h2>
              <div className="mt-4 space-y-3">
                {(dashboard?.upcomingReservations || []).length === 0 && <p className="text-sm text-slate-500">No approved reservations scheduled.</p>}
                {(dashboard?.upcomingReservations || []).slice(0, 5).map((item) => (
                  <div key={String(item._id)} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                    <div>
                      <p className="font-medium text-slate-800">{item.roomId && typeof item.roomId !== "string" ? item.roomId.name : "Room"}</p>
                      <p className="text-xs text-slate-500">{item.date} {item.startTime}-{item.endTime}</p>
                    </div>
                    {statusPill(item.status)}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <h2 className="text-lg font-semibold text-slate-900">Recent asset activity</h2>
              <div className="mt-4 space-y-3">
                {(dashboard?.recentAssetActivities || []).length === 0 && <p className="text-sm text-slate-500">No asset activity has been recorded yet.</p>}
                {(dashboard?.recentAssetActivities || []).slice(0, 5).map((item) => (
                  <div key={String(item._id)} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                    <div>
                      <p className="font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">Tag: {item.tag || "—"}</p>
                    </div>
                    {statusPill(item.status)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "buildings" && (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_2fr]">
            <div className="space-y-6">
              <form onSubmit={handleCreateBuilding} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Create building</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <input required value={buildingForm.name} onChange={(e) => setBuildingForm({ ...buildingForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Building name" />
                  <input required value={buildingForm.code} onChange={(e) => setBuildingForm({ ...buildingForm, code: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Building code" />
                  <input value={buildingForm.campus} onChange={(e) => setBuildingForm({ ...buildingForm, campus: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Campus" />
                  <input type="number" min="1" value={buildingForm.floors} onChange={(e) => setBuildingForm({ ...buildingForm, floors: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Floors" />
                  <select value={buildingForm.status || "Active"} onChange={(e) => setBuildingForm({ ...buildingForm, status: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Under Construction">Under Construction</option>
                  </select>
                  <textarea value={buildingForm.description} onChange={(e) => setBuildingForm({ ...buildingForm, description: e.target.value })} className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Description" rows={3} />
                </div>
                <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Save building</button>
              </form>

              <form onSubmit={handleCreateRoom} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Add classroom or room</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <select required value={roomForm.buildingId} onChange={(e) => setRoomForm({ ...roomForm, buildingId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2">
                    <option value="">Select building</option>
                    {buildings.map((building) => (
                      <option key={String(building._id || building.id)} value={String(building._id || building.id)}>{building.name}</option>
                    ))}
                  </select>
                  <input required value={roomForm.roomNumber} onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Room number / code" />
                  <input required value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Room name" />
                  <input value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Floor" />
                  <input type="number" min="0" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Capacity" />
                  <select value={roomForm.roomType} onChange={(e) => setRoomForm({ ...roomForm, roomType: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option>Classroom</option>
                    <option>Laboratory</option>
                    <option>Office</option>
                    <option>Seminar Hall</option>
                    <option>Conference Room</option>
                    <option>Storage</option>
                    <option>Library</option>
                    <option>Other</option>
                  </select>
                  <select aria-label="Initial room status" value={roomForm.status} onChange={(e) => setRoomForm({ ...roomForm, status: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {roomStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <input value={roomForm.facilities} onChange={(e) => setRoomForm({ ...roomForm, facilities: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Facilities (comma separated)" />
                  <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white md:col-span-2">Save room</button>
                </div>
              </form>
            </div>

            <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Buildings and room inventory</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 font-medium">Building</th>
                      <th className="px-3 py-2 font-medium">Campus</th>
                      <th className="px-3 py-2 font-medium">Floors</th>
                      <th className="px-3 py-2 font-medium">Rooms</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {buildings.length === 0 && <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>No buildings recorded.</td></tr>}
                    {buildings.map((building) => (
                      <tr key={String(building._id || building.id)}>
                        <td className="px-3 py-3 font-medium text-slate-800">{building.name}</td>
                        <td className="px-3 py-3 text-slate-600">{building.campus || "Main Campus"}</td>
                        <td className="px-3 py-3 text-slate-600">{building.floors || 1}</td>
                        <td className="px-3 py-3 text-slate-600">{building.roomCount ?? 0}</td>
                        <td className="px-3 py-3">{statusPill(building.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Rooms and classrooms</h2>
              <p className="mt-1 text-sm text-slate-500">Choose a room status to update its availability. Colors identify each status.</p>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Room status color legend">
                {roomStatuses.map((status) => <span key={status}>{statusPill(status)}</span>)}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 font-medium">Room</th>
                      <th className="px-3 py-2 font-medium">Building</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Capacity</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rooms.length === 0 && <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>No rooms recorded.</td></tr>}
                    {rooms.map((room) => (
                      <tr key={String(room._id)}>
                        <td className="px-3 py-3 font-medium text-slate-800">{room.name} {room.roomNumber ? `(${room.roomNumber})` : ""}</td>
                        <td className="px-3 py-3 text-slate-600">{typeof room.buildingId === "string" ? room.building : room.buildingId?.name || room.building || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{room.roomType || "Classroom"}</td>
                        <td className="px-3 py-3 text-slate-600">{room.capacity ?? 0}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col items-start gap-2">
                            {statusPill(room.status)}
                            <select
                              aria-label={`Update status for ${room.name}`}
                              value={room.status || ""}
                              disabled={!room._id || savingRoomStatusId === room._id}
                              onChange={(e) => {
                                if (room._id && e.target.value) void handleRoomStatusChange(room._id, e.target.value);
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:cursor-wait disabled:opacity-60"
                            >
                              <option value="" disabled>Select status</option>
                              {roomStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          </div>
        )}

        {activeTab === "labs" && (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_2fr]">
            <form onSubmit={handleCreateLab} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Create laboratory</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <input value={labForm.name} onChange={(e) => setLabForm({ ...labForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Lab name" />
                <input value={labForm.code} onChange={(e) => setLabForm({ ...labForm, code: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Lab code" />
                <select value={labForm.buildingId} onChange={(e) => setLabForm({ ...labForm, buildingId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Select building</option>
                  {buildings.map((building) => (
                    <option key={String(building._id || building.id)} value={String(building._id || building.id)}>{building.name}</option>
                  ))}
                </select>
                <input value={labForm.supervisor} onChange={(e) => setLabForm({ ...labForm, supervisor: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Supervisor" />
                <input value={labForm.department} onChange={(e) => setLabForm({ ...labForm, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Department" />
                <input value={labForm.capacity} onChange={(e) => setLabForm({ ...labForm, capacity: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Capacity" />
                <select value={labForm.laboratoryType} onChange={(e) => setLabForm({ ...labForm, laboratoryType: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="Computer">Computer</option>
                  <option value="Science">Science</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Workshop">Workshop</option>
                  <option value="Other">Other</option>
                </select>
                <select value={labForm.status} onChange={(e) => setLabForm({ ...labForm, status: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="Active">Active</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Save laboratory</button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Laboratories</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 font-medium">Laboratory</th>
                      <th className="px-3 py-2 font-medium">Building</th>
                      <th className="px-3 py-2 font-medium">Capacity</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {labs.length === 0 && <tr><td className="px-3 py-4 text-slate-500" colSpan={4}>No laboratories configured.</td></tr>}
                    {labs.map((lab) => (
                      <tr key={String(lab._id)}>
                        <td className="px-3 py-3 font-medium text-slate-800">{lab.name}</td>
                        <td className="px-3 py-3 text-slate-600">{typeof lab.buildingId === "string" ? lab.buildingId : lab.buildingId?.name || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{lab.capacity ?? 0}</td>
                        <td className="px-3 py-3">{statusPill(lab.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "reservations" && (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_2fr]">
            <form onSubmit={handleCreateReservation} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Book a room</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <select value={reservationForm.roomId} onChange={(e) => setReservationForm({ ...reservationForm, roomId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Select room</option>
                  {rooms.map((room) => (
                    <option key={String(room._id)} value={String(room._id)}>{room.name}</option>
                  ))}
                </select>
                <input value={reservationForm.requesterName} onChange={(e) => setReservationForm({ ...reservationForm, requesterName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Requester name" />
                <input type="date" value={reservationForm.date} onChange={(e) => setReservationForm({ ...reservationForm, date: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input type="time" value={reservationForm.startTime} onChange={(e) => setReservationForm({ ...reservationForm, startTime: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input type="time" value={reservationForm.endTime} onChange={(e) => setReservationForm({ ...reservationForm, endTime: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input value={reservationForm.department} onChange={(e) => setReservationForm({ ...reservationForm, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Department / event" />
                <textarea value={reservationForm.purpose} onChange={(e) => setReservationForm({ ...reservationForm, purpose: e.target.value })} className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Purpose" />
              </div>
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Submit reservation</button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Reservation ledger</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 font-medium">Room</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {reservations.length === 0 && <tr><td className="px-3 py-4 text-slate-500" colSpan={4}>No reservations recorded.</td></tr>}
                    {reservations.map((reservation) => (
                      <tr key={String(reservation._id)}>
                        <td className="px-3 py-3 text-slate-800">{typeof reservation.roomId === "string" ? reservation.roomId : reservation.roomId?.name || "Room"}</td>
                        <td className="px-3 py-3 text-slate-600">{reservation.date || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{reservation.startTime || "—"} - {reservation.endTime || "—"}</td>
                        <td className="px-3 py-3">{statusPill(reservation.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "maintenance" && (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_2fr]">
            <form onSubmit={handleCreateMaintenance} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Submit maintenance request</h2>
              <div className="grid gap-3">
                <input value={maintenanceForm.title} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Request title" />
                <textarea value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={4} placeholder="Description" />
                <div className="grid gap-3 md:grid-cols-2">
                  <select value={maintenanceForm.category} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, category: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="Electrical">Electrical</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="HVAC">HVAC</option>
                    <option value="Furniture">Furniture</option>
                    <option value="IT Equipment">IT Equipment</option>
                    <option value="Laboratory Equipment">Laboratory Equipment</option>
                    <option value="Structural">Structural</option>
                    <option value="Cleaning">Cleaning</option>
                    <option value="Other">Other</option>
                  </select>
                  <select value={maintenanceForm.priority} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Log request</button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Work order pipeline</h2>
              <div className="mt-4 space-y-3">
                {maintenance.length === 0 && <p className="text-sm text-slate-500">No maintenance records yet.</p>}
                {maintenance.map((item) => (
                  <div key={String(item._id)} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium text-slate-800">{item.title}</p>
                      {statusPill(item.status)}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.category} · {item.priority}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "assets" && (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_2fr]">
            <form onSubmit={handleCreateAsset} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Register asset</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <input value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Asset name" />
                <input value={assetForm.tag} onChange={(e) => setAssetForm({ ...assetForm, tag: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Asset tag" />
                <input value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Category" />
                <input value={assetForm.department} onChange={(e) => setAssetForm({ ...assetForm, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Department" />
                <select value={assetForm.status} onChange={(e) => setAssetForm({ ...assetForm, status: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="Registered">Registered</option>
                  <option value="Available">Available</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Under Maintenance">Under Maintenance</option>
                  <option value="Damaged">Damaged</option>
                  <option value="Retired">Retired</option>
                  <option value="Disposed">Disposed</option>
                </select>
                <input value={assetForm.condition} onChange={(e) => setAssetForm({ ...assetForm, condition: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Condition" />
                <input value={assetForm.quantity} onChange={(e) => setAssetForm({ ...assetForm, quantity: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Quantity" />
                <textarea value={assetForm.description} onChange={(e) => setAssetForm({ ...assetForm, description: e.target.value })} className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Description" />
              </div>
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Save asset</button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Asset register</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-3 py-2 font-medium">Asset</th>
                      <th className="px-3 py-2 font-medium">Tag</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assets.length === 0 && <tr><td className="px-3 py-4 text-slate-500" colSpan={4}>No assets registered.</td></tr>}
                    {assets.map((item) => (
                      <tr key={String(item._id)}>
                        <td className="px-3 py-3 font-medium text-slate-800">{item.name}</td>
                        <td className="px-3 py-3 text-slate-600">{item.tag || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{item.availableQuantity ?? item.quantity ?? 0}</td>
                        <td className="px-3 py-3">{statusPill(item.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "transport" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-6">
              <form onSubmit={handleCreateVehicle} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Vehicle management</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={vehicleForm.registrationNumber} onChange={(e) => setVehicleForm({ ...vehicleForm, registrationNumber: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Registration number" />
                  <input value={vehicleForm.makeModel} onChange={(e) => setVehicleForm({ ...vehicleForm, makeModel: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Make / model" />
                  <input value={vehicleForm.capacity} onChange={(e) => setVehicleForm({ ...vehicleForm, capacity: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Capacity" />
                  <input value={vehicleForm.assignedDriver} onChange={(e) => setVehicleForm({ ...vehicleForm, assignedDriver: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Assigned driver" />
                  <select value={vehicleForm.vehicleType} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="Bus">Bus</option>
                    <option value="Van">Van</option>
                    <option value="Car">Car</option>
                    <option value="Truck">Truck</option>
                  </select>
                  <select value={vehicleForm.status} onChange={(e) => setVehicleForm({ ...vehicleForm, status: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="Active">Active</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Save vehicle</button>
              </form>

              <form onSubmit={handleCreateRoute} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Route management</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Route name" />
                  <input value={routeForm.code} onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Route code" />
                  <input value={routeForm.startPoint} onChange={(e) => setRouteForm({ ...routeForm, startPoint: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Start point" />
                  <input value={routeForm.destination} onChange={(e) => setRouteForm({ ...routeForm, destination: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Destination" />
                  <input value={routeForm.assignedDriver} onChange={(e) => setRouteForm({ ...routeForm, assignedDriver: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Assigned driver" />
                  <input value={routeForm.stops} onChange={(e) => setRouteForm({ ...routeForm, stops: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Stops (comma separated)" />
                </div>
                <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Create route</button>
              </form>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Vehicles</h2>
                <div className="mt-4 space-y-3">
                  {vehicles.length === 0 && <p className="text-sm text-slate-500">No vehicles have been registered.</p>}
                  {vehicles.map((vehicle) => (
                    <div key={String(vehicle._id)} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                      <div>
                        <p className="font-medium text-slate-800">{vehicle.registrationNumber}</p>
                        <p className="text-xs text-slate-500">{vehicle.vehicleType} · {vehicle.assignedDriver || "Unassigned"}</p>
                      </div>
                      {statusPill(vehicle.status)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Routes</h2>
                <div className="mt-4 space-y-3">
                  {routes.length === 0 && <p className="text-sm text-slate-500">No transport routes configured.</p>}
                  {routes.map((route) => (
                    <div key={String(route._id)} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-medium text-slate-800">{route.name}</p>
                        {statusPill(route.status)}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{route.startPoint} → {route.destination}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampusFacilitiesExtendedView;
