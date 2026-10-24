import React, { useState, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  VEHICLE_PRESETS,
  CAR_PATHS,
  SHUTTLE_ROUTE,
  DELIVERY_PATH,
  DELIVERY_WAIT_DURATION,
  DELIVERY_CYCLE,
  pickSeeded,
} from "./constants";
import { Vehicle, VehicleConfig, createWaypointCurve } from "./Vehicles";

export interface VehiclesManagerProps {
  active: boolean;
  enabled: boolean;
  timeOfDay: "day" | "evening" | "night";
}

const MAX_CARS = 6;
const CAR_SPAWN_INTERVAL = 8000;

export function VehiclesManager({ active, enabled, timeOfDay }: VehiclesManagerProps) {
  const [cars, setCars] = useState<VehicleConfig[]>([]);
  const [shuttle, setShuttle] = useState<VehicleConfig | null>(null);
  const [deliveryTruck, setDeliveryTruck] = useState<VehicleConfig | null>(null);
  const [showDelivery, setShowDelivery] = useState(false);

  const spawnTimerRef = useRef(0);
  const lastDeliveryRef = useRef(0);
  const cycleRef = useRef<"entering" | "active" | "leaving" | "waiting">("waiting");

  useEffect(() => {
    if (!shuttle) {
      const curve = createWaypointCurve(SHUTTLE_ROUTE);
      const stops = SHUTTLE_ROUTE.map((wp, i) => ({
        t: i / (SHUTTLE_ROUTE.length - 1),
        duration: 3000 + (i * 37 % 4000),
      }));

      setShuttle({
        id: "shuttle-1",
        type: "shuttle",
        color: "#0d6e6e",
        path: curve,
        speed: 1.8,
        progress: 0,
        stops,
        spawnTime: 0,
      });
    }
  }, [shuttle]);

  useEffect(() => {
    if (!deliveryTruck) {
      const curve = createWaypointCurve(DELIVERY_PATH);
      setDeliveryTruck({
        id: "delivery-1",
        type: "delivery",
        color: "#eab308",
        path: curve,
        speed: 2.0,
        progress: 0,
        stops: [{ t: 0.4, duration: DELIVERY_WAIT_DURATION }],
        spawnTime: 0,
      });
    }
  }, [deliveryTruck]);

  useFrame(({ clock }) => {
    if (!enabled || !active) return;
    const delta = clock.getDelta();

    spawnTimerRef.current += delta * 1000;
    if (spawnTimerRef.current >= CAR_SPAWN_INTERVAL && cars.length < MAX_CARS) {
      spawnTimerRef.current = 0;
      const pathIdx = Math.floor(Math.random() * CAR_PATHS.length);
      const curve = createWaypointCurve(CAR_PATHS[pathIdx]);
      const preset = pickSeeded(VEHICLE_PRESETS, cars.length);

      const newCar: VehicleConfig = {
        id: `car-${Date.now()}-${cars.length}`,
        type: "car",
        color: preset.color,
        path: curve,
        speed: 2.2 + Math.random() * 1.2,
        progress: Math.random() * 0.5,
        stops: [],
        spawnTime: 0,
      };

      setCars((prev) => [...prev, newCar]);
    }

    if (cars.length > MAX_CARS) {
      setCars((prev) => prev.slice(prev.length - MAX_CARS));
    }

    if (deliveryTruck) {
      const now = clock.elapsedTime * 1000;
      const cycleProgress = ((now % DELIVERY_CYCLE) / DELIVERY_CYCLE);

      if (cycleProgress < 0.05 || cycleProgress > 0.9) {
        setShowDelivery(false);
        cycleRef.current = "waiting";
      } else if (cycleProgress < 0.45) {
        setShowDelivery(true);
        cycleRef.current = cycleProgress < 0.1 ? "entering" : "active";
      } else if (cycleProgress < 0.55) {
        cycleRef.current = "leaving";
        setShowDelivery(true);
      } else {
        setShowDelivery(false);
        cycleRef.current = "waiting";
      }
    }
  });

  const visibleCarCount = useMemo(() => {
    if (!active || !enabled) return 0;
    const factor = timeOfDay === "night" ? 0.3 : timeOfDay === "evening" ? 0.6 : 1.0;
    return Math.floor(MAX_CARS * factor);
  }, [active, enabled, timeOfDay]);

  const visibleCars = useMemo(
    () => cars.slice(0, visibleCarCount),
    [cars, visibleCarCount],
  );

  const shuttleActive = useMemo(
    () => active && enabled && (timeOfDay === "day" || timeOfDay === "evening"),
    [active, enabled, timeOfDay],
  );

  return (
    <group>
      {visibleCars.map((car) => (
        <Vehicle
          key={car.id}
          config={car}
          active={active && enabled}
          enabled={enabled}
        />
      ))}

      {shuttle && shuttleActive && (
        <Vehicle
          key="shuttle-1"
          config={shuttle}
          active={true}
          enabled={enabled}
        />
      )}

      {deliveryTruck && showDelivery && (
        <Vehicle
          key="delivery-1"
          config={deliveryTruck}
          active={true}
          enabled={enabled}
        />
      )}
    </group>
  );
}
