import React, { useState, useRef, useEffect } from "react";
import { Box, Image, Text, Stack, Badge, Progress, Tabs } from "@chakra-ui/react";
import { Button } from "../ui/button";
import { InputGroup } from "../ui/input-group";
import { Skeleton } from "../ui/skeleton";

interface DetectionResult {
  class_id: number;
  class_name?: string;
  confidence: number;
  bbox: number[];
  area?: number;
}

interface VideoDetectionResult {
  video_info: {
    total_frames: number;
    frames_with_defects: number;
    total_detections: number;
    extraction_fps: number;
  };
  class_statistics: Record<string, number>;
  frame_results: Array<{
    frame_file: string;
    frame_index: number;
    class_counts: Record<string, number>;
    total_detections: number;
    detections: DetectionResult[];
  }>;
}

const API_URL = "http://localhost:8000/api/v1";

export default function DetectionUpload() {
  const [activeTab, setActiveTab] = useState("image");
  
  // 图片检测状态
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<DetectionResult[] | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{width: number, height: number} | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);

  // 视频检测状态
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<VideoDetectionResult | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [extractionFps, setExtractionFps] = useState(1);

  // 图片处理函数
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setImageFile(selectedFile);
      setImageResult(null);
      setImageError(null);
      // 生成图片预览
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setImagePreview(null);
      setImageFile(null);
    }
  };

  const handleImageUpload = async () => {
    if (!imageFile) return;
    setImageLoading(true);
    setImageError(null);
    setImageResult(null);
    const formData = new FormData();
    formData.append("file", imageFile);
    try {
      const res = await fetch(`${API_URL}/yolo/predict-image`, {
        method: "POST",
        body: formData,
      });
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || "服务器未返回有效JSON");
      }
      if (!res.ok) {
        throw new Error(data.error || "上传或识别失败");
      }
      setImageResult(data.results);
    } catch (e: any) {
      setImageError(e.message || "请求失败");
    } finally {
      setImageLoading(false);
    }
  };

  // 视频处理函数
  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setVideoFile(selectedFile);
      setVideoResult(null);
      setVideoError(null);
      // 生成视频预览
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setVideoPreview(null);
      setVideoFile(null);
    }
  };

  const handleVideoUpload = async () => {
    if (!videoFile) return;
    setVideoLoading(true);
    setVideoError(null);
    setVideoResult(null);
    const formData = new FormData();
    formData.append("file", videoFile);
    formData.append("fps", extractionFps.toString());
    try {
      const res = await fetch(`${API_URL}/yolo-video/predict-video`, {
        method: "POST",
        body: formData,
      });
      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || "服务器未返回有效JSON");
      }
      if (!res.ok) {
        throw new Error(data.error || "上传或识别失败");
      }
      setVideoResult(data);
    } catch (e: any) {
      setVideoError(e.message || "请求失败");
    } finally {
      setVideoLoading(false);
    }
  };

  // 获取图片原始尺寸
  useEffect(() => {
    if (imageRef.current && imagePreview) {
      const img = imageRef.current;
      if (img.complete) {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      } else {
        img.onload = () => {
          setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        };
      }
    }
  }, [imagePreview]);

  // 绘制检测框
  useEffect(() => {
    if (!imageResult || !imageSize || !imageCanvasRef.current || !imageRef.current) return;
    const canvas = imageCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 清空
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 计算缩放比例
    const displayWidth = imageRef.current.width;
    const displayHeight = imageRef.current.height;
    const scaleX = displayWidth / imageSize.width;
    const scaleY = displayHeight / imageSize.height;
    // 绘制每个框
    imageResult.forEach((item) => {
      const [x1, y1, x2, y2] = item.bbox;
      ctx.strokeStyle = "#e53e3e";
      ctx.lineWidth = 2;
      ctx.strokeRect(x1 * scaleX, y1 * scaleY, (x2 - x1) * scaleX, (y2 - y1) * scaleY);
      ctx.font = "14px Arial";
      ctx.fillStyle = "#e53e3e";
      const label = item.class_name || item.class_id;
      ctx.fillText(`${label} ${(item.confidence * 100).toFixed(1)}%`, x1 * scaleX + 2, y1 * scaleY + 16);
    });
  }, [imageResult, imageSize]);

  return (
    <Box maxW="4xl" mx="auto" mt={8} p={4}>
      <Tabs.Root value={activeTab} onValueChange={(details) => setActiveTab(details.value)} variant="enclosed">
        <Tabs.List>
          <Tabs.Trigger value="image">图片检测</Tabs.Trigger>
          <Tabs.Trigger value="video">视频检测</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="image">
          <Box borderWidth={1} borderRadius="lg" boxShadow="md" p={6}>
            <Text fontSize="lg" fontWeight="bold" mb={4}>图片路面灾害检测</Text>
            
            {imagePreview && (
              <Box mb={4} textAlign="center" position="relative" display="inline-block">
                <Image
                  src={imagePreview}
                  alt="预览"
                  maxH="500px"
                  maxW="800px"
                  mx="auto"
                  borderRadius="md"
                  ref={imageRef}
                  style={{ display: "block", width: "auto", height: "auto", maxWidth: "800px", maxHeight: "500px" }}
                />
                {/* 画框Canvas */}
                {imageRef.current && imageRef.current.width && imageRef.current.height && (
                  <canvas
                    ref={imageCanvasRef}
                    width={imageRef.current.width}
                    height={imageRef.current.height}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      pointerEvents: "none",
                      width: imageRef.current.width,
                      height: imageRef.current.height,
                      zIndex: 2,
                    }}
                  />
                )}
              </Box>
            )}
            
            <InputGroup>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                style={{ marginBottom: 12 }}
              />
            </InputGroup>
            
            <Button onClick={handleImageUpload} disabled={!imageFile || imageLoading} style={{ width: "100%" }}>
              {imageLoading ? "识别中..." : "上传并识别"}
            </Button>
            
            <Box mt={6} minH={120} borderWidth={1} borderRadius="md" p={3} bg="gray.50">
              {imageLoading && <Skeleton height="80px" />}
              {imageError && <Box color="red.500">{imageError}</Box>}
              {imageResult && imageResult.length === 0 && <Box color="gray.500">未检测到病害</Box>}
              {imageResult && imageResult.length > 0 && (
                <Box as="ul" pl={4}>
                  {imageResult.map((item, idx) => (
                    <li key={idx}>
                      类型: {item.class_name || item.class_id} ｜ 置信度: {item.confidence.toFixed(2)} ｜
                      坐标: [{item.bbox.map((v) => v.toFixed(0)).join(", ")}] ｜ 面积: {item.area ? item.area.toFixed(0) : "-"}
                    </li>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </Tabs.Content>

        <Tabs.Content value="video">
          <Box borderWidth={1} borderRadius="lg" boxShadow="md" p={6}>
            <Text fontSize="lg" fontWeight="bold" mb={4}>视频路面灾害检测</Text>
            
            {videoPreview && (
              <Box mb={4} textAlign="center">
                <video
                  src={videoPreview}
                  controls
                  style={{ maxWidth: "100%", maxHeight: "300px", borderRadius: "8px" }}
                />
              </Box>
            )}
            
            <Stack direction="column" gap={4}>
              <InputGroup>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoFileChange}
                  style={{ marginBottom: 12 }}
                />
              </InputGroup>
              
              <Box>
                <Text mb={2}>提取帧率 (每秒帧数):</Text>
                <select 
                  value={extractionFps} 
                  onChange={(e) => setExtractionFps(Number(e.target.value))}
                  style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                >
                  <option value={1}>1 帧/秒</option>
                  <option value={2}>2 帧/秒</option>
                  <option value={5}>5 帧/秒</option>
                  <option value={10}>10 帧/秒</option>
                </select>
              </Box>
              
              <Button onClick={handleVideoUpload} disabled={!videoFile || videoLoading} style={{ width: "100%" }}>
                {videoLoading ? "处理中..." : "上传并检测"}
              </Button>
            </Stack>
            
            <Box mt={6} minH={120} borderWidth={1} borderRadius="md" p={3} bg="gray.50">
              {videoLoading && (
                <Stack direction="column" gap={4}>
                  <Text>正在处理视频...</Text>
                  <Progress.Root size="sm" style={{ width: "100%" }}>
                    <Progress.Track>
                      <Progress.Range />
                    </Progress.Track>
                  </Progress.Root>
                </Stack>
              )}
              {videoError && <Box color="red.500">{videoError}</Box>}
              {videoResult && (
                <Stack direction="column" gap={4}>
                  {/* 视频信息 */}
                  <Box>
                    <Text fontWeight="bold" mb={2}>视频检测统计:</Text>
                    <Stack direction="row" gap={4} wrap="wrap">
                      <Badge colorScheme="blue">总帧数: {videoResult.video_info.total_frames}</Badge>
                      <Badge colorScheme="green">有病害帧数: {videoResult.video_info.frames_with_defects}</Badge>
                      <Badge colorScheme="red">总检测数: {videoResult.video_info.total_detections}</Badge>
                      <Badge colorScheme="purple">提取帧率: {videoResult.video_info.extraction_fps} FPS</Badge>
                    </Stack>
                  </Box>
                  
                  {/* 类别统计 */}
                  {Object.keys(videoResult.class_statistics).length > 0 && (
                    <Box>
                      <Text fontWeight="bold" mb={2}>病害类型统计:</Text>
                      <Stack direction="row" gap={2} wrap="wrap">
                        {Object.entries(videoResult.class_statistics).map(([className, count]) => (
                          <Badge key={className} colorScheme="orange">
                            {className}: {count}
                          </Badge>
                        ))}
                      </Stack>
                    </Box>
                  )}
                  
                  {/* 详细结果 */}
                  {videoResult.frame_results.length > 0 && (
                    <Box>
                      <Text fontWeight="bold" mb={2}>检测详情:</Text>
                      <Box maxH="300px" overflowY="auto">
                        {videoResult.frame_results.map((frame, idx) => (
                          <Box key={idx} p={2} borderWidth={1} borderRadius="md" mb={2}>
                            <Text fontWeight="semibold">帧 {frame.frame_index + 1}: {frame.frame_file}</Text>
                            <Text fontSize="sm" color="gray.600">检测到 {frame.total_detections} 个病害</Text>
                            <Stack direction="row" gap={2} mt={1} wrap="wrap">
                              {Object.entries(frame.class_counts).map(([className, count]) => (
                                <Badge key={className} size="sm" colorScheme="red">
                                  {className}: {count}
                                </Badge>
                              ))}
                            </Stack>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                  
                  {videoResult.frame_results.length === 0 && (
                    <Box color="gray.500">未检测到任何路面病害</Box>
                  )}
                </Stack>
              )}
            </Box>
          </Box>
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
} 