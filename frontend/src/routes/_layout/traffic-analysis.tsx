import React from "react"
import { Container } from "@chakra-ui/react"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import PassengerCountChart from '../../components/Traffic_analysis/PassengerCountChart'
import VehicleTrajectory from '../../components/Traffic_analysis/VehicleTrajectory'
import PassengerDensityHeatMap from '../../components/Traffic_analysis/PassengerDensityHeatMap'
import MapView from '../../components/Traffic_analysis/MapView'
import CongestionStatus from '../../components/Traffic_analysis/CongestionStatus'

export const Route = createFileRoute("/_layout/traffic-analysis")({
  component: TrafficAnalysis,
})

function TrafficAnalysis() {
  const search = useSearch({ from: "/_layout/traffic-analysis" })
  const tab = search.tab || "pickup-density"

  let content = null
  if (tab === "pickup-density") {
    content = <PassengerDensityHeatMap />
  } else if (tab === "vehicle-trajectory") {
    content = <VehicleTrajectory />
  } else if (tab === "statistics") {
    content = <PassengerCountChart />
  } else if (tab === "map-view") {
    content = <MapView />
  } else if (tab === "congestion-status") {
    content = <CongestionStatus />
  }

  return (
    <Container maxW="full" mt={6}>
      {content}
    </Container>
  )
} 