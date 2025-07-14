import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
} from "@chakra-ui/react"
import { useState, useCallback, useRef, useEffect } from "react"
import { FiSearch, FiUpload, FiCamera, FiRotateCcw } from "react-icons/fi"
import React from "react"

interface FaceRecognitionResult {
  status: "success" | "failure"
  message?: string
  exception?: string
  username?: string
  best_match?: string
  confidence?: number
  min_distance?: number
}

export function FaceVerification() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<FaceRecognitionResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isCameraLoading, setIsCameraLoading] = useState(false)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // 简单的提示函数
  const showToast = (message: string, type: 'success' | 'error') => {
    console.log(`${type}: ${message}`)
  }

  // 启动摄像头
  const startCamera = async () => {
    try {
      console.log('正在请求摄像头权限...')
      setIsCameraLoading(true)
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true
      })
      
      console.log('摄像头权限获取成功:', stream)
      
      setIsCameraActive(true)
      setIsCameraLoading(false)
      streamRef.current = stream
      
      // 强制刷新组件状态
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(err => {
            console.error('验证摄像头视频播放失败:', err)
          })
        }
      }, 50)
      
    } catch (error) {
      console.error('无法访问摄像头:', error)
      showToast('无法访问摄像头，请检查权限设置', 'error')
      setIsCameraLoading(false)
    }
  }

  // 停止摄像头
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
    setCapturedImage(null)
  }

  // 拍照
  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    
    if (video && canvas) {
      const context = canvas.getContext('2d')
      if (context) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], 'captured_photo.jpg', { type: 'image/jpeg' })
            setCapturedImage(canvas.toDataURL('image/jpeg'))
            setSelectedFile(file)
          }
        }, 'image/jpeg', 0.8)
      }
    }
  }

  // 重新拍照
  const retakePhoto = () => {
    setCapturedImage(null)
    // 重新启动验证摄像头
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
    // 延迟重新启动摄像头
    setTimeout(() => {
      startCamera()
    }, 100)
    setSelectedFile(null)
  }

  // 处理文件上传
  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true)
    setResult(null)

    try {
      console.log("前端: 开始验证请求")
      const formData = new FormData()
      formData.append("file", file)

      const apiUrl = "http://localhost:8000"
      
      // 创建AbortController用于超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时
      
      const response = await fetch(`${apiUrl}/api/v1/face-recognition/verify-face`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      console.log(`前端: 验证响应状态: ${response.status}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: FaceRecognitionResult = await response.json()
      console.log("前端: 验证响应数据:", data)
      setResult(data)

      if (data.status === "success") {
        showToast(data.message || "验证成功", "success")
      } else {
        showToast(data.exception || "验证失败", "error")
      }
      return data
    } catch (error: any) {
      console.error("前端: API 请求失败:", error)
      
      let errorMessage = "未知错误"
      if (error.name === 'AbortError') {
        errorMessage = "请求超时，请检查后端服务是否启动"
      } else if (error.message) {
        errorMessage = error.message
      }
      
      setResult({
        status: "failure",
        exception: errorMessage
      })
      
      showToast(`请求失败: ${errorMessage}`, "error")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 开始验证
  const startVerification = () => {
    if (selectedFile) {
      handleFileUpload(selectedFile)
      // 验证完成后关闭摄像头
      stopCamera()
    } else {
      showToast("请先拍照", "error")
    }
  }

  // 组件卸载时清理摄像头
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  return (
    <Container maxW="full" py={8}>
      <Heading size="lg" mb={6}>人脸验证</Heading>
      
      <VStack gap={6} w="full" maxW="600px" mx="auto">
        <Box w="full" p={6} border="1px" borderColor="gray.200" borderRadius="lg">
          <HStack mb={4}>
            <FiSearch />
            <Heading size="md">人脸验证</Heading>
          </HStack>
          
          <VStack gap={4}>
            <Text fontSize="sm" color="gray.600">
              使用摄像头拍照进行身份验证
            </Text>
            
            <Box w="full">
              {/* 摄像头预览 */}
              {isCameraActive && !capturedImage && (
                <Box w="full" mb={4} position="relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ 
                      width: '100%', 
                      height: '240px',
                      borderRadius: '8px',
                      backgroundColor: '#e0e0e0'
                    }}
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <Button
                    position="absolute"
                    bottom={2}
                    left="50%"
                    transform="translateX(-50%)"
                    colorScheme="blue"
                    onClick={() => capturePhoto()}
                  >
                    <FiCamera style={{ marginRight: "8px" }} />
                    拍照
                  </Button>
                </Box>
              )}

              {/* 拍照后的图片显示 */}
              {capturedImage && (
                <Box w="full" mb={4} position="relative">
                  <img 
                    src={capturedImage} 
                    alt="拍照结果" 
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                  <Button
                    position="absolute"
                    top={2}
                    right={2}
                    size="sm"
                    colorScheme="red"
                    onClick={() => retakePhoto()}
                  >
                    <FiRotateCcw style={{ marginRight: "4px" }} />
                    重拍
                  </Button>
                </Box>
              )}

              {/* 摄像头控制按钮 */}
              {!isCameraActive && !capturedImage && (
                <Button
                  colorScheme="blue"
                  onClick={() => startCamera()}
                  w="full"
                  mb={3}
                  disabled={isCameraLoading}
                >
                  <FiCamera style={{ marginRight: "8px" }} />
                  {isCameraLoading ? "启动中..." : "启动摄像头"}
                </Button>
              )}
              
              <Button
                colorScheme="blue"
                onClick={startVerification}
                disabled={!capturedImage || isLoading}
                w="full"
              >
                <FiUpload style={{ marginRight: "8px" }} />
                {isLoading ? "验证中..." : "开始验证"}
              </Button>
            </Box>
            
            {result && (
              <Box w="full" p={4} bg={result.status === "success" ? "green.50" : "red.50"} borderRadius="md" textAlign="center">
                <Text fontWeight="bold" color={result.status === "success" ? "green.600" : "red.600"}>
                  {result.status === "success" ? "验证成功" : "验证失败"}
                </Text>
                {result.status === "success" && (result.username || result.best_match) ? (
                  <Text fontWeight="bold" color="green.600" mt={1}>
                    您好，{result.username || result.best_match}！
                  </Text>
                ) : (
                  <Text fontSize="sm" mt={1}>
                    {result.message || result.exception}
                  </Text>
                )}
                {result.confidence && (
                  <Text fontSize="sm" mt={1} color="purple.600">
                    置信度: {Math.round(result.confidence * 100)}%
                  </Text>
                )}
                {result.min_distance !== undefined && (
                  <Text fontSize="sm" mt={1} color="orange.600">
                    距离: {result.min_distance.toFixed(4)}
                  </Text>
                )}
              </Box>
            )}
          </VStack>
        </Box>
      </VStack>
    </Container>
  )
} 