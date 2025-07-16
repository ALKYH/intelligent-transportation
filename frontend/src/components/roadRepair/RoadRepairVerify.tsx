import React, { useState, useRef, useEffect } from "react";
const apiUrl = "http://localhost:8000/api/v1";
import { Route } from "../../routes/repair";
import { Field } from "../ui/field";
import { Button } from "../ui/button";
import { InputGroup } from "../ui/input-group";
import { Box, Text } from "@chakra-ui/react";
import { FiCamera, FiUpload, FiRotateCcw } from "react-icons/fi";

interface FaceRecognitionResult {
  status: "success" | "failure";
  message?: string;
  exception?: string;
  username?: string;
  best_match?: string;
  confidence?: number;
  min_distance?: number;
}

// === 拷贝自DetectionUpload.tsx ===
interface FrameWithBoxesProps {
  src: string;
  detections: Array<{ bbox: number[]; class_name?: string; class_id?: number}>;
}
function FrameWithBoxes({ src, detections }: FrameWithBoxesProps) {
  const imgRef = React.useRef<HTMLImageElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [imgSize, setImgSize] = React.useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });

  React.useEffect(() => {
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

  React.useEffect(() => {
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
      ctx.fillText(det.class_name || String(det.class_id ?? ''), x1 * scaleX + 2, y1 * scaleY + 16);
    });
  }, [src, detections, imgSize]);

  return (
    <Box position="relative" display="inline-block">
      <img ref={imgRef} src={src} alt="检测图片" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #eee" }} />
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

export default function RoadRepairVerify() {
  const id = new URLSearchParams(window.location.search).get("id");

  // 人脸识别相关
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [faceOk, setFaceOk] = useState(false);
  const [faceResult, setFaceResult] = useState<FaceRecognitionResult | null>(null);
  const [isFaceLoading, setIsFaceLoading] = useState(false);
  const [faceMsg, setFaceMsg] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [roadDetection, setRoadDetection] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 摄像头相关
  const startCamera = async () => {
    try {
      setIsCameraLoading(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setIsCameraActive(true);
      setIsCameraLoading(false);
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (error) {
      setIsCameraLoading(false);
      alert("无法访问摄像头，请检查权限设置");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setCapturedImage(null);
  };

  // 拍照
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas) {
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            setCapturedImage(canvas.toDataURL('image/jpeg'));
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  // 重新拍照
  const retakePhoto = () => {
    setCapturedImage(null);
    stopCamera();
    setTimeout(() => {
      startCamera();
    }, 100);
    setFaceOk(false);
    setFaceResult(null);
    setFaceMsg("");
  };

  // 人脸识别（只调用 /api/v1/face-recognition/verify-face）
  const startFaceVerification = async () => {
    if (!capturedImage) return;
    setIsFaceLoading(true);
    setFaceMsg("");
    setFaceOk(false);
    try {
      const blob = await (await fetch(capturedImage)).blob();
      const formData = new FormData();
      formData.append("file", blob, "face.jpg");
      // formData.append("id", id || ""); // 如需传id可解开
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${apiUrl}/api/v1/face-recognition/verify-face`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      setFaceResult(data);
      if (!res.ok) {
        let errorMsg = data.detail?.msg || data.msg || data.detail || `HTTP ${res.status}: ${res.statusText}`;
        setFaceOk(false);
        setFaceMsg(errorMsg);
        return;
      }
      if (data.status === "success") {
        setFaceOk(true);
        setFaceMsg("人脸识别通过");
      } else {
        setFaceOk(false);
        setFaceMsg(data.message || data.exception || "人脸识别未通过");
      }
    } catch (error: any) {
      let errorMsg = "未知错误";
      if (error.name === 'AbortError') {
        errorMsg = "请求超时，请检查后端服务是否启动";
      } else if (error.message) {
        errorMsg = error.message;
      }
      setFaceOk(false);
      setFaceMsg(errorMsg);
    } finally {
      setIsFaceLoading(false);
      stopCamera();
    }
  };

  // 组件卸载时清理摄像头
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/logger/road-surface-detection/${Number(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || "查询失败");
        }
        return res.json();
      })
      .then((data) => {
        setRoadDetection(data);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Box maxW="600px" mx="auto" mt={8} p={6} borderWidth={1} borderRadius={8} boxShadow="md">
      <Text fontSize="2xl" fontWeight="bold" mb={4}>人脸识别验证</Text>
      <Text mb={2}>工单ID: <b>{id}</b></Text>
      {/* 路面检测信息展示 */}
      <Box mt={6}>
        <Text fontSize="xl" fontWeight="bold" mb={2}>路面检测信息</Text>
        {loading && <Text color="blue.500">加载中...</Text>}
        {error && <Text color="red.500">{error}</Text>}
        {roadDetection && (
          <Box p={4} bg="gray.50" borderRadius="md">
            {/* 文件展示 */}
            {roadDetection.file_data && roadDetection.file_type && (
              roadDetection.file_type.match(/(jpg|jpeg|png|gif)/i) ? (
                <Box mt={2}>
                  <Text fontWeight="bold">原始图片（含检测框）：</Text>
                  <FrameWithBoxes
                    src={`data:image/${roadDetection.file_type};base64,${roadDetection.file_data}`}
                    detections={roadDetection.disease_info}
                  />
                </Box>
              ) : roadDetection.file_type.match(/(mp4|webm|ogg)/i) ? (
                (() => {
                  const videoMimeMap: Record<string, string> = {
                    mp4: 'video/mp4',
                    webm: 'video/webm',
                    ogg: 'video/ogg'
                  };
                  const videoMime = videoMimeMap[roadDetection.file_type?.toLowerCase() || ''] || 'video/mp4';
                  return (
                    <Box mt={2}>
                      <Text fontWeight="bold">原始视频：</Text>
                      <video
                        src={`data:${videoMime};base64,${roadDetection.file_data}`}
                        controls
                        style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #eee" }}
                      />
                    </Box>
                  );
                })()
              ) : (
                <Text color="gray.500">不支持的文件类型</Text>
              )
            )}
            <Text><b>病害信息:</b></Text>
            {Array.isArray(roadDetection.disease_info) && roadDetection.disease_info.length > 0 ? (
              roadDetection.disease_info.map((item: any, idx: number) => (
                <Box key={idx} pl={4} mb={2} borderLeft="2px solid #eee">
                  <Text>类型: {item.disease_type}</Text>
                  {item.area_m2 !== 0 ? (
                    <Text>面积: {item.area_m2.toFixed(2)} m²</Text>
                  ) : item.length_m !== 0 ? (
                    <Text>长度: {item.length_m.toFixed(2)} m</Text>
                  ) : null}
                </Box>
              ))
            ) : (
              <Text color="gray.500" pl={4}>无病害信息</Text>
            )}
          </Box>
        )}
      </Box>
      <Field label="人脸识别">
        {/* 摄像头预览 */}
        {isCameraActive && !capturedImage && (
          <Box w="full" mb={4} position="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '240px', borderRadius: '8px', backgroundColor: '#e0e0e0' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <Button
              style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)' }}
              onClick={capturePhoto}
              colorScheme="blue"
            >
              <FiCamera style={{ marginRight: 8 }} /> 拍照
            </Button>
          </Box>
        )}
        {/* 拍照后的图片显示 */}
        {capturedImage && (
          <Box w="full" mb={4} position="relative">
            <img src={capturedImage} alt="拍照结果" style={{ width: '100%', borderRadius: '8px' }} />
            <Button
              style={{ position: 'absolute', top: 8, right: 8 }}
              size="sm"
              colorScheme="red"
              onClick={retakePhoto}
            >
              <FiRotateCcw style={{ marginRight: 4 }} /> 重拍
            </Button>
          </Box>
        )}
        {/* 摄像头控制按钮 */}
        {!isCameraActive && !capturedImage && (
          <Button colorScheme="blue" onClick={startCamera} loading={isCameraLoading} w="full" mb={3}>
            <FiCamera style={{ marginRight: 8 }} /> {isCameraLoading ? "启动中..." : "启动摄像头"}
          </Button>
        )}
        <Button
          colorScheme="blue"
          onClick={startFaceVerification}
          disabled={!capturedImage || isFaceLoading}
          loading={isFaceLoading}
          w="full"
        >
          <FiUpload style={{ marginRight: 8 }} /> {isFaceLoading ? "验证中..." : "开始验证"}
        </Button>
        <Text color={faceOk ? "green.500" : "red.500"} fontSize="sm" mt={1}>{faceMsg}</Text>
        {faceResult && (
          <Box w="full" p={4} bg={faceResult.status === "success" ? "green.50" : "red.50"} borderRadius="md" textAlign="center">
            <Text fontWeight="bold" color={faceResult.status === "success" ? "green.600" : "red.600"}>
              {faceResult.status === "success" ? "验证成功" : "验证失败"}
            </Text>
            {faceResult.status === "success" && (faceResult.username || faceResult.best_match) ? (
              <Text fontWeight="bold" color="green.600" mt={1}>
                您好，{faceResult.username || faceResult.best_match}！
              </Text>
            ) : (
              <Text fontSize="sm" mt={1}>
                {faceResult.message || faceResult.exception}
              </Text>
            )}
            {faceResult.confidence && (
              <Text fontSize="sm" mt={1} color="purple.600">
                置信度: {Math.round(faceResult.confidence * 100)}%
              </Text>
            )}
            {faceResult.min_distance !== undefined && (
              <Text fontSize="sm" mt={1} color="orange.600">
                距离: {faceResult.min_distance.toFixed(4)}
              </Text>
            )}
          </Box>
        )}
      </Field>
    </Box>
  );
}
