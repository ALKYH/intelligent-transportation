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

// 帧图片+标注框组件
interface FrameWithBoxesProps {
  src: string;
  detections: Array<{ bbox: number[]; class_name?: string; class_id?: number}>;
}
function FrameWithBoxes({ src, detections }: FrameWithBoxesProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    function updateSize() {
      if (!img) return;
      setImgSize({ width: img.width, height: img.height, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    }
    if (img.complete) {
      updateSize();
    } else {
      img.onload = updateSize;
    }
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    detections?.forEach(det => {
      const [x1, y1, x2, y2] = det.bbox;
      const scaleX = img.width / (img.naturalWidth || 1);
      const scaleY = img.height / (img.naturalHeight || 1);
      ctx.strokeStyle = "#e53e3e";
      ctx.lineWidth = 2;
      ctx.strokeRect(x1 * scaleX, y1 * scaleY, (x2 - x1) * scaleX, (y2 - y1) * scaleY);
      ctx.font = "14px Arial";
      ctx.fillStyle = "#e53e3e";

      ctx.fillText(det.class_name_en || det.class_name || String(det.class_id ?? ''), x1 * scaleX + 2, y1 * scaleY + 16);
    });
  }, [src, detections, imgSize]);

  return (
    <Box position="relative" display="inline-block">
      <Image ref={imgRef} src={src} alt="帧图片" maxW="120px" maxH="120px" />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: "none",
          width: imgSize.width,
          height: imgSize.height,
        }}
      />
    </Box>
  );
}

export default function DetectionUpload() {
  const [activeTab, setActiveTab] = useState("image");
  
  // 替换图片检测相关状态
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageResults, setImageResults] = useState<any[]>([]); // [{filename, results, annotated_image_base64}]
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // 视频检测状态
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<VideoDetectionResult | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [extractionFps, setExtractionFps] = useState(1);

  // 处理多图片选择
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setImageFiles(files);
      setImageResults([]);
      setImageError(null);
      // 生成所有图片预览
      Promise.all(files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      })).then(setImagePreviews);
    } else {
      setImagePreviews([]);
      setImageFiles([]);
    }
  };

  // 批量上传图片
  const handleImageUpload = async () => {
    if (!imageFiles.length) return;
    setImageLoading(true);
    setImageError(null);
    setImageResults([]);
    const formData = new FormData();
    imageFiles.forEach(file => formData.append('files', file));
    try {
      const res = await fetch(`${API_URL}/yolo/predict-images`, {
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
      setImageResults(data.results);
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
            <InputGroup>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageFileChange}
                style={{ marginBottom: 12 }}
              />
            </InputGroup>
            <Button onClick={handleImageUpload} disabled={!imageFiles.length || imageLoading} style={{ width: "100%" }}>
              {imageLoading ? "识别中..." : "批量上传并识别"}
            </Button>
            <Box mt={6} minH={120} borderWidth={1} borderRadius="md" p={3} bg="gray.50">
              {imageLoading && <Skeleton height="80px" />}
              {imageError && <Box color="red.500">{imageError}</Box>}
              {imagePreviews.length > 0 && (
                <Stack direction="row" gap={4} wrap="wrap">
                  {imagePreviews.map((src, idx) => (
                    <Box key={idx} mb={2}>
                      <Image src={src} alt={`预览${idx+1}`} maxH="120px" maxW="160px" borderRadius="md" />
                    </Box>
                  ))}
                </Stack>
              )}
              {imageResults.length > 0 && (
                <Stack direction="column" gap={6} mt={4}>
                  {imageResults.map((item, idx) => (
                    <Box key={idx} borderWidth={1} borderRadius="md" p={4} display="flex" flexDirection="column" alignItems="center" maxW="700px" mx="auto">
                      <Text fontWeight="bold" mb={2}>{item.filename}</Text>
                      {item.annotated_image_base64 ? (
                        <Image src={item.annotated_image_base64} alt={item.filename} maxW="100%" maxH="400px" borderRadius="md" mb={2} style={{objectFit: 'contain', width: '100%', height: 'auto'}} />
                      ) : (
                        <Box color="red.500" mb={2}>图片读取失败</Box>
                      )}
                      <Box as="ul" pl={2} mt={2} w="100%">
                        {item.results.length === 0 && <li style={{color:'#888'}}>未检测到病害</li>}
                        {item.results.map((r: any, i: number) => (
                          <li key={i} style={{fontSize: '15px', marginBottom: 2}}>
                            类型: {r.class_name || r.class_id} ｜ 置信度: {r.confidence.toFixed(2)}
                            {typeof r.length_m === 'number' && (
                              <> ｜ 长度: {r.length_m.toFixed(2)} m</>
                            )}
                            {typeof r.area_m2 === 'number' && (
                              <> ｜ 面积: {r.area_m2.toFixed(2)} m²</>
                            )}
                          </li>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Stack>
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
                          <Box key={idx} p={2} borderWidth={1} borderRadius="md" mb={2} display="flex" alignItems="flex-start" gap={4}>
                            {/* 用新组件显示带标注框的帧图片 */}
                            <FrameWithBoxes src={frame.frame_file} detections={frame.detections} />
                            {/* 检测结果信息 */}
                            <Box flex={1} minW={0}>
                              <Text fontWeight="semibold">帧 {frame.frame_index + 1}</Text>
                              <Text fontSize="sm" color="gray.600">检测到 {frame.total_detections} 个病害</Text>
                              <Stack direction="row" gap={2} mt={1} wrap="wrap">
                                {Object.entries(frame.class_counts).map(([className, count]) => (
                                  <Badge key={className} size="sm" colorScheme="red">
                                    {className}: {count}
                                  </Badge>
                                ))}
                              </Stack>
                            </Box>
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