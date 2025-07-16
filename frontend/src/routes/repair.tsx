import { createFileRoute } from "@tanstack/react-router";
import RoadRepairVerify from "../components/roadRepair/RoadRepairVerify";

export const Route = createFileRoute("/repair")({
  component: RoadRepairVerify,
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === 'string' ? search.id : '',
  }),
}); 