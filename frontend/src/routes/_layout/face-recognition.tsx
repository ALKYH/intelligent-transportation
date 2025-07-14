import { createFileRoute } from "@tanstack/react-router"
import { FaceRecognitionComponent } from "@/components/FaceRecognition/FaceRecognitionComponent"

export const Route = createFileRoute("/_layout/face-recognition")({
  component: FaceRecognition,
})

function FaceRecognition() {
  return <FaceRecognitionComponent />
} 