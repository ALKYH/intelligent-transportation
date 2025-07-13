import React, { useState, useRef, useEffect } from "react";
import { Box, Image } from "@chakra-ui/react";
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

const API_URL = "http://localhost:8000/api/v1/yolo/predict-image";

export default function DetectionUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgSize, setImgSize] = useState<{width: number, height: number} | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setResult(null);
      setError(null);
      // 生成图片预览
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
      setFile(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(API_URL, {
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
      setResult(data.results);
    } catch (e: any) {
      setError(e.message || "请求失败");
    } finally {
      setLoading(false);
    }
  };

  // 获取图片原始尺寸
  useEffect(() => {
    if (imgRef.current && preview) {
      const img = imgRef.current;
      if (img.complete) {
        setImgSize({ width: img.naturalWidth, height: img.naturalHeight });
      } else {
        img.onload = () => {
          setImgSize({ width: img.naturalWidth, height: img.naturalHeight });
        };
      }
    }
  }, [preview]);

  // 绘制检测框
  useEffect(() => {
    if (!result || !imgSize || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 清空
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 计算缩放比例
    const displayWidth = imgRef.current.width;
    const displayHeight = imgRef.current.height;
    const scaleX = displayWidth / imgSize.width;
    const scaleY = displayHeight / imgSize.height;
    // 绘制每个框
    result.forEach((item) => {
      const [x1, y1, x2, y2] = item.bbox;
      ctx.strokeStyle = "#e53e3e";
      ctx.lineWidth = 2;
      ctx.strokeRect(x1 * scaleX, y1 * scaleY, (x2 - x1) * scaleX, (y2 - y1) * scaleY);
      ctx.font = "14px Arial";
      ctx.fillStyle = "#e53e3e";
      const label = item.class_name || item.class_id;
      ctx.fillText(`${label} ${(item.confidence * 100).toFixed(1)}%`, x1 * scaleX + 2, y1 * scaleY + 16);
    });
  }, [result, imgSize]);

  return (
    <Box maxW="md" mx="auto" mt={8} p={4} borderWidth={1} borderRadius="lg" boxShadow="md">
      {preview && (
        <Box mb={4} textAlign="center" position="relative" display="inline-block">
          <Image
            src={preview}
            alt="预览"
            maxH="200px"
            mx="auto"
            borderRadius="md"
            ref={imgRef}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />
          {/* 画框Canvas */}
          {imgSize && (
            <canvas
              ref={canvasRef}
              width={imgSize.width}
              height={imgSize.height}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                pointerEvents: "none",
                width: imgRef.current ? imgRef.current.width : undefined,
                height: imgRef.current ? imgRef.current.height : undefined,
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
          onChange={handleFileChange}
          style={{ marginBottom: 12 }}
        />
      </InputGroup>
      <Button onClick={handleUpload} disabled={!file || loading} style={{ width: "100%" }}>
        {loading ? "识别中..." : "上传并识别"}
      </Button>
      <Box mt={6} minH={120} borderWidth={1} borderRadius="md" p={3} bg="gray.50">
        {loading && <Skeleton height="80px" />}
        {error && <Box color="red.500">{error}</Box>}
        {result && result.length === 0 && <Box color="gray.500">未检测到病害</Box>}
        {result && result.length > 0 && (
          <Box as="ul" pl={4}>
            {result.map((item, idx) => (
              <li key={idx}>
                类型: {item.class_name || item.class_id} ｜ 置信度: {item.confidence.toFixed(2)} ｜
                坐标: [{item.bbox.map((v) => v.toFixed(0)).join(", ")}] ｜ 面积: {item.area ? item.area.toFixed(0) : "-"}
              </li>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
} 