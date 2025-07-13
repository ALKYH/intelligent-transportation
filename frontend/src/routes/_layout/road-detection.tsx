import { Container, Heading, Text } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import DetectionUpload from "../../components/RoadDetection/DetectionUpload"

export const Route = createFileRoute("/_layout/road-detection")({
  component: RoadDetection,
})

function RoadDetection() {
  return (
    <Container maxW="full">
      <Heading size="lg" pt={12}>路面检测</Heading>
      <Text mt={4}>这里是路面检测模块页面。</Text>
      <DetectionUpload />
    </Container>
  )
} 