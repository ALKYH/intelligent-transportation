import React, { useState } from "react";
import { Box } from "@chakra-ui/react";
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
  const [result, setResult] = useState<DetectionResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "上传或识别失败");
      }
      const data = await res.json();
      setResult(data.results);
    } catch (e: any) {
      setError(e.message || "请求失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box maxW="md" mx="auto" mt={8} p={4} borderWidth={1} borderRadius="lg" boxShadow="md">
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