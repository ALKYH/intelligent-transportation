import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Input,
  Button,
} from "@chakra-ui/react"
import { useState, useCallback, useRef, useEffect } from "react"
import { FiUserPlus, FiCamera, FiRotateCcw } from "react-icons/fi"
import React from "react"
import { useForm } from "react-hook-form"

interface FaceRecognitionResult {
  status: "success" | "failure"
  message?: string
  exception?: string
  username?: string
  best_match?: string
  confidence?: number
  min_distance?: number
}

interface RegisterFormData {
  username: string
}

export function FaceRegistration() {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isCameraLoading, setIsCameraLoading] = useState(false)
  const [registerResult, setRegisterResult] = useState<FaceRecognitionResult | null>(null)
  const [usernameExists, setUsernameExists] = useState(false)
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<RegisterFormData>()

  // 监听用户名变化
  const currentUsername = watch("username")

  // 实时检查用户名
  useEffect(() => {
    const checkUsername = async () => {
      if (currentUsername && currentUsername.trim().length >= 2) {
        setIsCheckingUsername(true)
        try {
          const exists = await checkUsernameExists(currentUsername.trim())
          setUsernameExists(exists)
        } catch (error) {
          console.error("检查用户名失败:", error)
          setUsernameExists(false)
        } finally {
          setIsCheckingUsername(false)
        }
      } else {
        setUsernameExists(false)
      }
    }

    const timeoutId = setTimeout(checkUsername, 500) // 防抖延迟
    return () => clearTimeout(timeoutId)
  }, [currentUsername])

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
            console.error('注册摄像头视频播放失败:', err)
          })
        }
      }, 50)
      
    } catch (error) {
      console.error('无法访问摄像头:', error)
      showToast('无法访问摄像头，请检查权限设置', 'error')
      setIsCameraLoading(false)
    }
  }

  // 检查用户名并启动摄像头
  const checkUsernameAndStartCamera = async () => {
    // 用户名检查已经在useEffect中实时进行，这里直接启动摄像头
    startCamera()
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
    // 重新启动注册摄像头
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

  // 检查用户名是否已存在
  const checkUsernameExists = async (username: string): Promise<boolean> => {
    try {
      console.log(`前端: 检查用户名 ${username}`)
      const apiUrl = "http://localhost:8000"
      
      // 创建AbortController用于超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
      
      const response = await fetch(`${apiUrl}/api/v1/face-recognition/check-username?username=${encodeURIComponent(username)}`, {
        method: "GET",
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      console.log(`前端: 用户名检查响应状态: ${response.status}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`前端: 用户名检查响应数据:`, data)
        return data.exists || false
      }
      console.log(`前端: 用户名检查失败，状态码: ${response.status}`)
      return false
    } catch (error: any) {
      console.error("前端: 检查用户名失败:", error)
      if (error.name === 'AbortError') {
        console.error("前端: 用户名检查请求超时")
      }
      return false
    }
  }

  // 检查人脸是否已存在
  const checkFaceExists = async (file: File): Promise<boolean> => {
    try {
      console.log("前端: 开始检查人脸")
      const formData = new FormData()
      formData.append("file", file)

      const apiUrl = "http://localhost:8000"
      
      // 创建AbortController用于超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
      
      const response = await fetch(`${apiUrl}/api/v1/face-recognition/check-face`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      console.log(`前端: 人脸检查响应状态: ${response.status}`)
      if (response.ok) {
        const data = await response.json()
        console.log(`前端: 人脸检查响应数据:`, data)
        return data.exists || false
      }
      console.log(`前端: 人脸检查失败，状态码: ${response.status}`)
      return false
    } catch (error: any) {
      console.error("前端: 检查人脸失败:", error)
      if (error.name === 'AbortError') {
        console.error("前端: 人脸检查请求超时")
      }
      return false
    }
  }

  // 处理文件上传
  const handleFileUpload = useCallback(async (file: File, formData: FormData) => {
    setIsLoading(true)
    setRegisterResult(null)

    try {
      console.log("前端: 开始注册请求")
      const apiUrl = "http://localhost:8000"
      
      // 创建AbortController用于超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时
      
      const response = await fetch(`${apiUrl}/api/v1/face-recognition/register-face`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      
      console.log(`前端: 注册响应状态: ${response.status}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: FaceRecognitionResult = await response.json()
      console.log("前端: 注册响应数据:", data)
      setRegisterResult(data)

      if (data.status === "success") {
        showToast(data.message || "注册成功", "success")
      } else {
        showToast(data.exception || "注册失败", "error")
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
      
      setRegisterResult({
        status: "failure",
        exception: errorMessage
      })
      
      showToast(`请求失败: ${errorMessage}`, "error")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 人脸注册
  const handleFaceRegistration = useCallback(async (data: RegisterFormData) => {
    if (!selectedFile) {
      showToast("请先拍照", "error")
      return
    }

    console.log("前端: 开始注册流程")
    console.log(`前端: 用户名: ${data.username}`)

    // 检查用户名是否已存在
    const usernameExists = await checkUsernameExists(data.username)
    console.log(`前端: 用户名存在检查结果: ${usernameExists}`)
    if (usernameExists) {
      console.log("前端: 用户名已存在，阻止注册")
      setRegisterResult({
        status: "failure",
        exception: "用户名已存在"
      })
      showToast("用户名已存在", "error")
      return
    }

    // 检查人脸是否已存在
    const faceExists = await checkFaceExists(selectedFile)
    console.log(`前端: 人脸存在检查结果: ${faceExists}`)
    if (faceExists) {
      console.log("前端: 人脸已存在，阻止注册")
      setRegisterResult({
        status: "failure",
        message: "该人脸已注册，请使用其他照片或联系管理员"
      })
      return
    }

    console.log("前端: 检查通过，开始注册")
    const formData = new FormData()
    formData.append("username", data.username)
    formData.append("file", selectedFile)

    const result = await handleFileUpload(selectedFile, formData)
    
    // 注册成功后的处理
    if (result && result.status === "success") {
      // 重置所有状态以便进行下一次注册
      reset()
      setSelectedFile(null)
      setCapturedImage(null)
      stopCamera()
      setRegisterResult(result)
      
      // 延迟清除注册结果，让用户看到成功信息
      setTimeout(() => {
        setRegisterResult(null)
      }, 3000)
      
      showToast("注册成功，可以继续注册下一个用户", "success")
    } else {
      // 注册失败，保持当前状态
      setRegisterResult(result)
    }
  }, [handleFileUpload, reset, selectedFile])

  // 组件卸载时清理摄像头
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  return (
    <Container maxW="full" py={8}>
      <Heading size="lg" mb={6}>人脸注册</Heading>
      
      <VStack gap={6} w="full" maxW="600px" mx="auto">
        <Box w="full" p={6} border="1px" borderColor="gray.200" borderRadius="lg">
          <HStack mb={4}>
            <FiUserPlus />
            <Heading size="md">人脸注册</Heading>
          </HStack>
          
          <VStack gap={4}>
            <Text fontSize="sm" color="gray.600">
              注册新用户人脸到系统
            </Text>
            
            {!showRegisterForm ? (
              <VStack gap={4} w="full">
                <Button
                  colorScheme="green"
                  onClick={() => {
                    setShowRegisterForm(true)
                    setRegisterResult(null) // 清除之前的注册结果
                  }}
                  disabled={isLoading}
                  w="full"
                >
                  <FiUserPlus style={{ marginRight: "8px" }} />
                  注册新用户
                </Button>
              </VStack>
            ) : (
              <Box w="full" p={4} border="1px" borderColor="gray.300" borderRadius="md">
                <form onSubmit={handleSubmit(handleFaceRegistration)}>
                  <VStack gap={4}>
                    {/* 注册结果显示 */}
                    {registerResult && (
                      <Box w="full" p={4} bg={registerResult.status === "success" ? "green.50" : "red.50"} borderRadius="md" textAlign="center">
                        <Text fontWeight="bold" color={registerResult.status === "success" ? "green.600" : "red.600"}>
                          {registerResult.status === "success" ? "注册成功" : "注册失败"}
                        </Text>
                        <Text fontSize="sm" mt={1}>
                          {registerResult.message || registerResult.exception}
                        </Text>
                      </Box>
                    )}
                    
                    <Box w="full">
                      <Text fontSize="sm" mb={2}>用户名</Text>
                      <Input
                        {...register("username", {
                          required: "用户名是必填项",
                          minLength: { value: 2, message: "用户名至少2个字符" },
                        })}
                        placeholder="请输入用户名"
                      />
                      {errors.username && (
                        <Text fontSize="xs" color="red.500" mt={1}>
                          {errors.username.message}
                        </Text>
                      )}
                      {isCheckingUsername && (
                        <Text fontSize="xs" color="blue.500" mt={1}>
                          检查中...
                        </Text>
                      )}
                      {usernameExists && (
                        <Text fontSize="xs" color="red.500" mt={1}>
                          用户名已存在
                        </Text>
                      )}
                    </Box>
                    
                    <Box w="full">
                      <Text fontSize="sm" mb={2}>人脸图片</Text>
                      
                      {/* 注册摄像头预览 */}
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

                      {/* 注册拍照后的图片显示 */}
                      {capturedImage && (
                        <Box w="full" mb={4} position="relative">
                          <img 
                            src={capturedImage} 
                            alt="注册拍照结果" 
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

                      {/* 注册摄像头控制按钮 */}
                      {!isCameraActive && !capturedImage && (
                        <Button
                          colorScheme="blue"
                          onClick={() => checkUsernameAndStartCamera()}
                          w="full"
                          mb={3}
                          disabled={isCameraLoading || usernameExists || !currentUsername || currentUsername.trim().length < 2}
                        >
                          <FiCamera style={{ marginRight: "8px" }} />
                          {isCameraLoading ? "启动中..." : "启动摄像头"}
                        </Button>
                      )}
                    </Box>
                    
                    <HStack w="full">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setShowRegisterForm(false)
                          reset()
                          stopCamera()
                        }}
                        flex={1}
                      >
                        取消
                      </Button>
                      <Button
                        colorScheme="blue"
                        type="submit"
                        flex={1}
                        disabled={usernameExists || !currentUsername || currentUsername.trim().length < 2 || !selectedFile}
                      >
                        {isLoading ? "注册中..." : "注册"}
                      </Button>
                    </HStack>
                  </VStack>
                </form>
              </Box>
            )}
          </VStack>
        </Box>
      </VStack>
    </Container>
  )
} 