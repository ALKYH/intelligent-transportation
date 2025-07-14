import React from "react"
import { FaceVerification } from "./FaceVerification"
import { FaceRegistration } from "./FaceRegistration"

export function FaceRecognitionComponent() {
  return (
    <div>
      <FaceVerification />
      <FaceRegistration />
    </div>
  )
} 